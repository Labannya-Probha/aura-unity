-- Backfill active tenant memberships for the production/default tenant.
-- This keeps tenant-scoped RLS reads working after legacy user/data imports.

do $$
declare
  default_tenant constant uuid := '00000000-0000-0000-0000-000000000001';
begin
  insert into public.tenants (id, name, slug)
  values (default_tenant, 'Challengers of 90''s', 'challangersof90s')
  on conflict (id) do update
    set name = excluded.name,
        slug = excluded.slug,
        updated_at = now();

  if to_regclass('public.users') is not null
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'users'
        and column_name = 'email'
    )
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'users'
        and column_name = 'tenant_id'
    )
  then
    insert into public.tenant_members (tenant_id, user_id, role, status, is_active)
    select distinct
      coalesce(u.tenant_id, default_tenant),
      au.id,
      'owner',
      'active',
      true
    from public.users u
    join auth.users au on lower(au.email) = lower(u.email)
    where coalesce(u.tenant_id, default_tenant) = default_tenant
    on conflict (tenant_id, user_id) do update
      set role = excluded.role,
          status = 'active',
          is_active = true;
  end if;

  -- Last-resort production bootstrap: if no membership was produced from
  -- public.users, attach existing authenticated users to the default tenant.
  if not exists (
    select 1
    from public.tenant_members
    where tenant_id = default_tenant
      and status = 'active'
      and is_active = true
  )
  then
    insert into public.tenant_members (tenant_id, user_id, role, status, is_active)
    select default_tenant, au.id, 'owner', 'active', true
    from auth.users au
    on conflict (tenant_id, user_id) do update
      set role = excluded.role,
          status = 'active',
          is_active = true;
  end if;
end $$;
