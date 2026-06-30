-- Keep old bookmarked tenant URLs compatible with the canonical slug.

update public.tenants
set slug = 'challangersof90s',
    name = coalesce(nullif(name, ''), 'Challengers of 90''s'),
    updated_at = now()
where id = '00000000-0000-0000-0000-000000000001';

insert into public.tenants (id, name, slug)
select
  '00000000-0000-0000-0000-000000000001',
  'Challengers of 90''s',
  'challangersof90s'
where not exists (
  select 1 from public.tenants
  where id = '00000000-0000-0000-0000-000000000001'
);

do $$
declare
  default_tenant constant uuid := '00000000-0000-0000-0000-000000000001';
begin
  if to_regclass('public.users') is not null
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'users' and column_name = 'email'
    )
  then
    insert into public.tenant_members (tenant_id, user_id, role, status, is_active)
    select distinct default_tenant, au.id, 'owner', 'active', true
    from public.users u
    join auth.users au on lower(au.email) = lower(u.email)
    on conflict (tenant_id, user_id) do update
      set status = 'active',
          is_active = true,
          role = excluded.role;
  end if;
end $$;
