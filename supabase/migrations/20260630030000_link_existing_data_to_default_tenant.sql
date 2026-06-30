-- Link existing ERP data to the production tenant so tenant-scoped reads
-- return the data that was created before multi-tenant enforcement.

create extension if not exists pgcrypto;

insert into public.tenants (id, name, slug)
values (
  '00000000-0000-0000-0000-000000000001',
  'Challengers of 90''s',
  'challangersof90s'
)
on conflict (id) do update
set name = excluded.name,
    slug = excluded.slug,
    updated_at = now();

do $$
declare
  default_tenant constant uuid := '00000000-0000-0000-0000-000000000001';
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
    if to_regclass(format('public.%I', tbl_name)) is not null
      and not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = tbl_name
          and column_name = 'tenant_id'
      )
    then
      execute format(
        'alter table public.%I add column tenant_id uuid references public.tenants(id) on delete cascade',
        tbl_name
      );
    end if;
  end loop;

  if to_regclass('public.journal_items') is not null
    and to_regclass('public.journals') is not null
  then
    update public.journal_items ji
    set tenant_id = j.tenant_id
    from public.journals j
    where ji.journal_id = j.id
      and ji.tenant_id is null
      and j.tenant_id is not null;
  end if;

  if to_regclass('public.company_info') is not null then
    delete from public.company_info n
    using public.company_info e
    where n.tenant_id is null
      and e.tenant_id = default_tenant
      and e.setting_key is not distinct from n.setting_key;

    update public.company_info
    set tenant_id = default_tenant
    where tenant_id is null;

    delete from public.company_info a
    using public.company_info b
    where a.ctid < b.ctid
      and a.tenant_id = default_tenant
      and b.tenant_id = default_tenant
      and a.setting_key is not distinct from b.setting_key;
  end if;

  if to_regclass('public.coa') is not null then
    delete from public.coa n
    using public.coa e
    where n.tenant_id is null
      and e.tenant_id = default_tenant
      and e.account_code is not distinct from n.account_code;

    update public.coa
    set tenant_id = default_tenant
    where tenant_id is null;

    delete from public.coa a
    using public.coa b
    where a.ctid < b.ctid
      and a.tenant_id = default_tenant
      and b.tenant_id = default_tenant
      and a.account_code is not distinct from b.account_code;
  end if;

  foreach tbl_name in array array[
    'collections',
    'vouchers',
    'journals',
    'journal_items',
    'users'
  ]
  loop
    if to_regclass(format('public.%I', tbl_name)) is not null then
      execute format('update public.%I set tenant_id = $1 where tenant_id is null', tbl_name)
      using default_tenant;
    end if;
  end loop;
end $$;

-- If public.users maps login emails, make those auth users active members of
-- the tenant. This is what allows the browser client to pass RLS checks.
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
    select distinct
      default_tenant,
      au.id,
      'owner',
      'active',
      true
    from public.users u
    join auth.users au on lower(au.email) = lower(u.email)
    on conflict (tenant_id, user_id) do update
      set status = 'active',
          is_active = true,
          role = excluded.role;
  end if;
end $$;
