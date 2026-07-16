-- Aura Unity Phase 0: Central Aura Identity foundation
-- Supabase Auth remains the first identity provider, while application identity,
-- tenant membership and Odoo bindings become provider-neutral.

create table if not exists public.aura_identities (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_subject text not null,
  primary_email text,
  display_name text,
  avatar_url text,
  status text not null default 'active' check (status in ('active','disabled','pending')),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subject)
);

create unique index if not exists aura_identities_email_unique
  on public.aura_identities (lower(primary_email))
  where primary_email is not null;

create table if not exists public.aura_identity_memberships (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references public.aura_identities(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  role text not null check (role in ('owner','superuser','manager','finance_manager','accountant','collection_officer','approver','auditor','user','readonly')),
  status text not null default 'active' check (status in ('active','invited','disabled')),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (identity_id, tenant_id)
);

create unique index if not exists aura_identity_one_default_tenant
  on public.aura_identity_memberships(identity_id)
  where is_default = true and status = 'active';

create table if not exists public.aura_odoo_tenant_bindings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  environment text not null default 'development' check (environment in ('development','staging','production')),
  odoo_base_url text not null,
  odoo_database text not null,
  company_id bigint,
  integration_user_login text,
  secret_reference text,
  status text not null default 'provisioning' check (status in ('provisioning','active','suspended','failed')),
  last_health_check_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (odoo_base_url, odoo_database)
);

create table if not exists public.aura_identity_audit_log (
  id bigint generated always as identity primary key,
  identity_id uuid references public.aura_identities(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete set null,
  event_type text not null,
  ip_address inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create or replace function public.current_aura_identity_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.aura_identities
  where provider = 'supabase'
    and provider_subject = auth.uid()::text
    and status = 'active'
  limit 1;
$$;

alter table public.aura_identities enable row level security;
alter table public.aura_identity_memberships enable row level security;
alter table public.aura_odoo_tenant_bindings enable row level security;
alter table public.aura_identity_audit_log enable row level security;

drop policy if exists aura_identity_select_self on public.aura_identities;
create policy aura_identity_select_self on public.aura_identities
  for select using (id = public.current_aura_identity_id());

drop policy if exists aura_identity_insert_self on public.aura_identities;
create policy aura_identity_insert_self on public.aura_identities
  for insert with check (
    provider = 'supabase'
    and provider_subject = auth.uid()::text
  );

drop policy if exists aura_identity_update_self on public.aura_identities;
create policy aura_identity_update_self on public.aura_identities
  for update using (id = public.current_aura_identity_id())
  with check (id = public.current_aura_identity_id());

drop policy if exists aura_memberships_select_self on public.aura_identity_memberships;
create policy aura_memberships_select_self on public.aura_identity_memberships
  for select using (identity_id = public.current_aura_identity_id());

drop policy if exists aura_odoo_binding_select_member on public.aura_odoo_tenant_bindings;
create policy aura_odoo_binding_select_member on public.aura_odoo_tenant_bindings
  for select using (
    exists (
      select 1 from public.aura_identity_memberships m
      where m.identity_id = public.current_aura_identity_id()
        and m.tenant_id = aura_odoo_tenant_bindings.tenant_id
        and m.status = 'active'
    )
  );

-- Backfill provider-neutral identities and memberships from the existing model.
insert into public.aura_identities(provider, provider_subject, primary_email, display_name, status)
select 'supabase', u.id::text, u.email, coalesce(u.raw_user_meta_data->>'full_name', u.email), 'active'
from auth.users u
on conflict (provider, provider_subject) do update
set primary_email = excluded.primary_email,
    display_name = coalesce(excluded.display_name, public.aura_identities.display_name),
    updated_at = now();

insert into public.aura_identity_memberships(identity_id, tenant_id, role, status, is_default)
select ai.id, tm.tenant_id,
  case tm.role
    when 'owner' then 'owner'
    when 'superuser' then 'superuser'
    when 'manager' then 'manager'
    else 'user'
  end,
  case when tm.is_active and tm.status = 'active' then 'active' else 'disabled' end,
  false
from public.tenant_members tm
join public.aura_identities ai
  on ai.provider = 'supabase' and ai.provider_subject = tm.user_id::text
on conflict (identity_id, tenant_id) do update
set role = excluded.role,
    status = excluded.status,
    updated_at = now();

with ranked as (
  select id, row_number() over (partition by identity_id order by created_at, id) as rn
  from public.aura_identity_memberships
  where status = 'active'
)
update public.aura_identity_memberships m
set is_default = true
from ranked r
where m.id = r.id and r.rn = 1
  and not exists (
    select 1 from public.aura_identity_memberships x
    where x.identity_id = m.identity_id and x.is_default = true and x.status = 'active'
  );
