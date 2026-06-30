-- Enterprise data access hardening for Aura Unity ERP.
-- Keeps tenant isolation in RLS, while exposing the minimum API surface
-- the browser client needs to resolve tenant context and load ERP data.

create extension if not exists pgcrypto;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','superuser','manager','user')),
  status text not null default 'active' check (status in ('active','invited','disabled')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index if not exists tenant_members_tenant_id_idx on public.tenant_members (tenant_id);
create index if not exists tenant_members_user_id_idx on public.tenant_members (user_id);

create or replace function public.slug_key(value text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]+', '', 'g');
$$;

create or replace function public.is_active_tenant_member(check_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_members tm
    where tm.tenant_id = check_tenant_id
      and tm.user_id = auth.uid()
      and tm.is_active = true
      and tm.status = 'active'
  );
$$;

create or replace function public.resolve_current_tenant(requested_slug text default null)
returns table (
  tenant_id uuid,
  tenant_slug text,
  role text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  requested_key text := nullif(public.slug_key(requested_slug), '');
begin
  return query
  select t.id, t.slug, tm.role
  from public.tenant_members tm
  join public.tenants t on t.id = tm.tenant_id
  where tm.user_id = auth.uid()
    and tm.is_active = true
    and tm.status = 'active'
    and (requested_key is null or public.slug_key(t.slug) = requested_key)
  order by tm.created_at asc
  limit 1;

  if found then
    return;
  end if;

  if to_regclass('public.users') is not null
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'users' and column_name = 'tenant_id'
    )
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'users' and column_name = 'email'
    )
  then
    return query execute
      'select t.id, t.slug, ''owner''::text
       from public.users u
       join public.tenants t on t.id = u.tenant_id
       where lower(u.email) = lower(auth.jwt() ->> ''email'')
         and ($1 is null or public.slug_key(t.slug) = $1)
       limit 1'
      using requested_key;
  end if;
end;
$$;

grant usage on schema public to anon, authenticated;
grant select on public.tenants to authenticated;
grant select, insert, update on public.tenant_members to authenticated;
grant execute on function public.resolve_current_tenant(text) to authenticated;
grant execute on function public.is_active_tenant_member(uuid) to authenticated;
grant usage, select on all sequences in schema public to authenticated;

do $$
declare
  tbl_name text;
begin
  foreach tbl_name in array array[
    'company_info',
    'coa',
    'collections',
    'vouchers',
    'journals',
    'journal_items',
    'users'
  ]
  loop
    if to_regclass(format('public.%I', tbl_name)) is not null then
      execute format('grant select on table public.%I to authenticated', tbl_name);
      if tbl_name <> 'users' then
        execute format('grant insert, update, delete on table public.%I to authenticated', tbl_name);
      end if;
    end if;
  end loop;
end $$;

-- Transition safety: if public.users already carries tenant_id, make sure the
-- corresponding auth users become tenant members. This lets existing data load
-- immediately after migration without manually recreating memberships.
do $$
begin
  if to_regclass('public.users') is not null
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'users'
        and column_name = 'tenant_id'
    )
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'users'
        and column_name = 'email'
    )
  then
    insert into public.tenant_members (tenant_id, user_id, role, status, is_active)
    select distinct u.tenant_id, au.id, 'owner', 'active', true
    from public.users u
    join auth.users au on lower(au.email) = lower(u.email)
    where u.tenant_id is not null
    on conflict (tenant_id, user_id) do update
      set status = 'active',
          is_active = true,
          role = excluded.role;
  end if;
end $$;
