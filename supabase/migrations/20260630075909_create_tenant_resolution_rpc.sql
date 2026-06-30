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

grant execute on function public.slug_key(text) to authenticated;
grant execute on function public.is_active_tenant_member(uuid) to authenticated;
grant execute on function public.resolve_current_tenant(text) to authenticated;

notify pgrst, 'reload schema';
