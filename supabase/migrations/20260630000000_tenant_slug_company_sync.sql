-- Tenant slug routing + tenant-isolated company/account sync fixes.

create or replace function public.is_active_tenant_member(check_tenant_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1
    from public.tenant_members tm
    where tm.tenant_id = check_tenant_id
      and tm.user_id = auth.uid()
      and tm.is_active = true
      and tm.status = 'active'
  );
$$;

create or replace function public.my_tenant_id()
returns uuid language sql stable security definer as $$
  select tenant_id
  from public.tenant_members
  where user_id = auth.uid()
    and is_active = true
    and status = 'active'
  order by created_at asc
  limit 1;
$$;

alter table public.tenants enable row level security;
drop policy if exists "tenants_select_own" on public.tenants;
create policy "tenants_select_own" on public.tenants
  for select using (public.is_active_tenant_member(id));

alter table public.tenant_members enable row level security;
drop policy if exists "tenant_members_select_own" on public.tenant_members;
create policy "tenant_members_select_own" on public.tenant_members
  for select using (
    user_id = auth.uid()
    or public.is_active_tenant_member(tenant_id)
  );

-- Company info and COA must be unique inside a tenant, not globally.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'company_info'
      and con.contype = 'u'
      and (
        select array_agg(att.attname order by ord.ordinality)
        from unnest(con.conkey) with ordinality as ord(attnum, ordinality)
        join pg_attribute att on att.attrelid = rel.oid and att.attnum = ord.attnum
      ) = array['setting_key']
  loop
    execute format('alter table public.company_info drop constraint %I', constraint_name);
  end loop;
end $$;

do $$
declare
  index_name text;
begin
  for index_name in
    select idx.relname
    from pg_index ix
    join pg_class tbl on tbl.oid = ix.indrelid
    join pg_namespace nsp on nsp.oid = tbl.relnamespace
    join pg_class idx on idx.oid = ix.indexrelid
    where nsp.nspname = 'public'
      and tbl.relname = 'company_info'
      and ix.indisunique
      and not ix.indisprimary
      and (
        select array_agg(att.attname order by ord.ordinality)
        from unnest(ix.indkey) with ordinality as ord(attnum, ordinality)
        join pg_attribute att on att.attrelid = tbl.oid and att.attnum = ord.attnum
      ) = array['setting_key']
  loop
    execute format('drop index if exists public.%I', index_name);
  end loop;
end $$;

delete from public.company_info a
using public.company_info b
where a.ctid < b.ctid
  and a.tenant_id is not distinct from b.tenant_id
  and a.setting_key is not distinct from b.setting_key;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'company_info_tenant_setting_key_key'
      and conrelid = 'public.company_info'::regclass
  ) then
    alter table public.company_info
      add constraint company_info_tenant_setting_key_key unique (tenant_id, setting_key);
  end if;
end $$;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'coa'
      and con.contype = 'u'
      and (
        select array_agg(att.attname order by ord.ordinality)
        from unnest(con.conkey) with ordinality as ord(attnum, ordinality)
        join pg_attribute att on att.attrelid = rel.oid and att.attnum = ord.attnum
      ) = array['account_code']
  loop
    execute format('alter table public.coa drop constraint %I', constraint_name);
  end loop;
end $$;

do $$
declare
  index_name text;
begin
  for index_name in
    select idx.relname
    from pg_index ix
    join pg_class tbl on tbl.oid = ix.indrelid
    join pg_namespace nsp on nsp.oid = tbl.relnamespace
    join pg_class idx on idx.oid = ix.indexrelid
    where nsp.nspname = 'public'
      and tbl.relname = 'coa'
      and ix.indisunique
      and not ix.indisprimary
      and (
        select array_agg(att.attname order by ord.ordinality)
        from unnest(ix.indkey) with ordinality as ord(attnum, ordinality)
        join pg_attribute att on att.attrelid = tbl.oid and att.attnum = ord.attnum
      ) = array['account_code']
  loop
    execute format('drop index if exists public.%I', index_name);
  end loop;
end $$;

delete from public.coa a
using public.coa b
where a.ctid < b.ctid
  and a.tenant_id is not distinct from b.tenant_id
  and a.account_code is not distinct from b.account_code;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'coa_tenant_account_code_key'
      and conrelid = 'public.coa'::regclass
  ) then
    alter table public.coa
      add constraint coa_tenant_account_code_key unique (tenant_id, account_code);
  end if;
end $$;

-- RLS for tenant-owned ERP tables.
alter table public.company_info enable row level security;
drop policy if exists "company_info_tenant_select" on public.company_info;
create policy "company_info_tenant_select" on public.company_info
  for select using (public.is_active_tenant_member(tenant_id));
drop policy if exists "company_info_tenant_insert" on public.company_info;
create policy "company_info_tenant_insert" on public.company_info
  for insert with check (public.is_active_tenant_member(tenant_id));
drop policy if exists "company_info_tenant_update" on public.company_info;
create policy "company_info_tenant_update" on public.company_info
  for update using (public.is_active_tenant_member(tenant_id))
  with check (public.is_active_tenant_member(tenant_id));

alter table public.coa enable row level security;
drop policy if exists "coa_tenant_select" on public.coa;
create policy "coa_tenant_select" on public.coa
  for select using (public.is_active_tenant_member(tenant_id));
drop policy if exists "coa_tenant_insert" on public.coa;
create policy "coa_tenant_insert" on public.coa
  for insert with check (public.is_active_tenant_member(tenant_id));
drop policy if exists "coa_tenant_update" on public.coa;
create policy "coa_tenant_update" on public.coa
  for update using (public.is_active_tenant_member(tenant_id))
  with check (public.is_active_tenant_member(tenant_id));

alter table public.collections enable row level security;
drop policy if exists "collections_tenant_all" on public.collections;
create policy "collections_tenant_all" on public.collections
  for all using (public.is_active_tenant_member(tenant_id))
  with check (public.is_active_tenant_member(tenant_id));

alter table public.vouchers enable row level security;
drop policy if exists "vouchers_tenant_all" on public.vouchers;
create policy "vouchers_tenant_all" on public.vouchers
  for all using (public.is_active_tenant_member(tenant_id))
  with check (public.is_active_tenant_member(tenant_id));

alter table public.journals enable row level security;
drop policy if exists "journals_tenant_all" on public.journals;
create policy "journals_tenant_all" on public.journals
  for all using (public.is_active_tenant_member(tenant_id))
  with check (public.is_active_tenant_member(tenant_id));

alter table public.journal_items enable row level security;
drop policy if exists "journal_items_tenant_all" on public.journal_items;
create policy "journal_items_tenant_all" on public.journal_items
  for all using (public.is_active_tenant_member(tenant_id))
  with check (public.is_active_tenant_member(tenant_id));
