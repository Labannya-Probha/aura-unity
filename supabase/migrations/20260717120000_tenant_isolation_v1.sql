-- Aura Unity Enterprise Tenant Isolation v1
-- Run in Supabase SQL Editor after reviewing backup.
begin;

-- 1) Active membership helper: supports users belonging to more than one tenant.
create or replace function public.is_active_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_members tm
    where tm.tenant_id = p_tenant_id
      and tm.user_id = auth.uid()
      and tm.is_active = true
      and tm.status = 'active'
  );
$$;

revoke all on function public.is_active_tenant_member(uuid) from public;
grant execute on function public.is_active_tenant_member(uuid) to authenticated;

-- 2) Resolve the URL tenant slug only when the signed-in user is an active member.
create or replace function public.resolve_current_tenant(requested_slug text default null)
returns table (
  tenant_id uuid,
  tenant_slug text,
  tenant_name text,
  member_role text
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.slug, t.name, tm.role
  from public.tenants t
  join public.tenant_members tm
    on tm.tenant_id = t.id
  where tm.user_id = auth.uid()
    and tm.is_active = true
    and tm.status = 'active'
    and (
      requested_slug is null
      or requested_slug = ''
      or lower(t.slug) = lower(requested_slug)
    )
  order by
    case when lower(t.slug) = lower(coalesce(requested_slug, '')) then 0 else 1 end,
    tm.created_at asc
  limit 1;
$$;

revoke all on function public.resolve_current_tenant(text) from public;
grant execute on function public.resolve_current_tenant(text) to authenticated;

-- 3) Enforce tenant RLS on every physical public table containing tenant_id.
do $$
declare
  r record;
  policy_name text;
begin
  for r in
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public'
      and c.relkind in ('r','p')
      and a.attname = 'tenant_id'
      and not a.attisdropped
      and c.relname not in ('tenant_members')
  loop
    execute format('alter table public.%I enable row level security', r.table_name);
    execute format('alter table public.%I force row level security', r.table_name);

    policy_name := 'tenant_isolation_v1_' || r.table_name;
    execute format('drop policy if exists %I on public.%I', policy_name, r.table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_active_tenant_member(tenant_id)) with check (public.is_active_tenant_member(tenant_id))',
      policy_name, r.table_name
    );
  end loop;
end $$;

-- 4) Strengthen tenants and tenant_members read access.
alter table public.tenants enable row level security;
alter table public.tenants force row level security;
drop policy if exists tenant_isolation_v1_tenants_select on public.tenants;
create policy tenant_isolation_v1_tenants_select
on public.tenants for select to authenticated
using (public.is_active_tenant_member(id));

alter table public.tenant_members enable row level security;
alter table public.tenant_members force row level security;
drop policy if exists tenant_isolation_v1_members_select on public.tenant_members;
create policy tenant_isolation_v1_members_select
on public.tenant_members for select to authenticated
using (
  user_id = auth.uid()
  or public.is_active_tenant_member(tenant_id)
);

-- 5) Remove misleading production branding from the demo tenant.
-- Adjust setting_key values only if your company_info schema uses different keys.
insert into public.company_info (tenant_id, setting_key, setting_value)
select t.id, v.setting_key, v.setting_value
from public.tenants t
cross join (
  values
    ('name', 'Aura Unity Demo'),
    ('sub', 'Enterprise Accounting Sandbox'),
    ('address', ''),
    ('phone', ''),
    ('logo', '')
) as v(setting_key, setting_value)
where t.slug = 'demo-test-tenant'
on conflict do nothing;

commit;

-- AUDIT RESULT 1: tables with tenant_id and RLS status
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid
where n.nspname = 'public'
  and c.relkind in ('r','p')
  and a.attname = 'tenant_id'
  and not a.attisdropped
order by c.relname;

-- AUDIT RESULT 2: rows with null tenant_id (must be reviewed/backfilled)
do $$
declare
  r record;
  null_count bigint;
begin
  raise notice 'Tables containing NULL tenant_id:';
  for r in
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public'
      and c.relkind in ('r','p')
      and a.attname = 'tenant_id'
      and not a.attisdropped
  loop
    execute format('select count(*) from public.%I where tenant_id is null', r.table_name)
      into null_count;
    if null_count > 0 then
      raise notice '%: % NULL tenant rows', r.table_name, null_count;
    end if;
  end loop;
end $$;

-- AUDIT RESULT 3: verify demo tenant branding and memberships
select t.id, t.slug, t.name, tm.user_id, tm.role, tm.status, tm.is_active
from public.tenants t
left join public.tenant_members tm on tm.tenant_id = t.id
where t.slug = 'demo-test-tenant';
