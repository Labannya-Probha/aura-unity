alter table if exists public.users enable row level security;
drop policy if exists "users_tenant_select" on public.users;
drop policy if exists "users_tenant_insert" on public.users;
drop policy if exists "users_tenant_update" on public.users;
drop policy if exists "users_tenant_delete" on public.users;

create policy "users_tenant_select" on public.users
  for select using (public.is_active_tenant_member(tenant_id));

create policy "users_tenant_insert" on public.users
  for insert with check (public.is_active_tenant_member(tenant_id));

create policy "users_tenant_update" on public.users
  for update using (public.is_active_tenant_member(tenant_id))
  with check (public.is_active_tenant_member(tenant_id));

create policy "users_tenant_delete" on public.users
  for delete using (public.is_active_tenant_member(tenant_id));

notify pgrst, 'reload schema';
