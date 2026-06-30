do $$
declare
  tbl text;
begin
  foreach tbl in array array['company_info','coa','collections','vouchers','journals','journal_items']
  loop
    if to_regclass(format('public.%I', tbl)) is not null then
      execute format('alter table public.%I enable row level security', tbl);
    end if;
  end loop;
end $$;

alter table if exists public.company_info enable row level security;
drop policy if exists "company_info_tenant_select" on public.company_info;
drop policy if exists "company_info_tenant_insert" on public.company_info;
drop policy if exists "company_info_tenant_update" on public.company_info;
drop policy if exists "company_info_tenant_delete" on public.company_info;
create policy "company_info_tenant_select" on public.company_info
  for select using (public.is_active_tenant_member(tenant_id));
create policy "company_info_tenant_insert" on public.company_info
  for insert with check (public.is_active_tenant_member(tenant_id));
create policy "company_info_tenant_update" on public.company_info
  for update using (public.is_active_tenant_member(tenant_id))
  with check (public.is_active_tenant_member(tenant_id));
create policy "company_info_tenant_delete" on public.company_info
  for delete using (public.is_active_tenant_member(tenant_id));

alter table if exists public.coa enable row level security;
drop policy if exists "coa_tenant_select" on public.coa;
drop policy if exists "coa_tenant_insert" on public.coa;
drop policy if exists "coa_tenant_update" on public.coa;
drop policy if exists "coa_tenant_delete" on public.coa;
create policy "coa_tenant_select" on public.coa
  for select using (public.is_active_tenant_member(tenant_id));
create policy "coa_tenant_insert" on public.coa
  for insert with check (public.is_active_tenant_member(tenant_id));
create policy "coa_tenant_update" on public.coa
  for update using (public.is_active_tenant_member(tenant_id))
  with check (public.is_active_tenant_member(tenant_id));
create policy "coa_tenant_delete" on public.coa
  for delete using (public.is_active_tenant_member(tenant_id));

alter table if exists public.collections enable row level security;
drop policy if exists "collections_tenant_all" on public.collections;
drop policy if exists "collections_tenant_select" on public.collections;
drop policy if exists "collections_tenant_insert" on public.collections;
drop policy if exists "collections_tenant_update" on public.collections;
drop policy if exists "collections_tenant_delete" on public.collections;
create policy "collections_tenant_all" on public.collections
  for all using (public.is_active_tenant_member(tenant_id))
  with check (public.is_active_tenant_member(tenant_id));

alter table if exists public.vouchers enable row level security;
drop policy if exists "vouchers_tenant_all" on public.vouchers;
drop policy if exists "vouchers_tenant_select" on public.vouchers;
drop policy if exists "vouchers_tenant_insert" on public.vouchers;
drop policy if exists "vouchers_tenant_update" on public.vouchers;
drop policy if exists "vouchers_tenant_delete" on public.vouchers;
create policy "vouchers_tenant_all" on public.vouchers
  for all using (public.is_active_tenant_member(tenant_id))
  with check (public.is_active_tenant_member(tenant_id));

alter table if exists public.journals enable row level security;
drop policy if exists "journals_tenant_all" on public.journals;
drop policy if exists "journals_tenant_select" on public.journals;
drop policy if exists "journals_tenant_insert" on public.journals;
drop policy if exists "journals_tenant_update" on public.journals;
drop policy if exists "journals_tenant_delete" on public.journals;
create policy "journals_tenant_all" on public.journals
  for all using (public.is_active_tenant_member(tenant_id))
  with check (public.is_active_tenant_member(tenant_id));

alter table if exists public.journal_items enable row level security;
drop policy if exists "journal_items_tenant_all" on public.journal_items;
drop policy if exists "journal_items_tenant_select" on public.journal_items;
drop policy if exists "journal_items_tenant_insert" on public.journal_items;
drop policy if exists "journal_items_tenant_update" on public.journal_items;
drop policy if exists "journal_items_tenant_delete" on public.journal_items;
create policy "journal_items_tenant_all" on public.journal_items
  for all using (public.is_active_tenant_member(tenant_id))
  with check (public.is_active_tenant_member(tenant_id));

notify pgrst, 'reload schema';
