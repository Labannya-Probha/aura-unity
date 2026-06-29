-- ══════════════════════════════════════════
-- Multi-Tenant ERP Schema Migration
-- Creates tenants + tenant_members tables
-- and adds tenant_id to all ERP tables.
-- ══════════════════════════════════════════

-- ─────────────────────────────────────────
-- 1. tenants — one row per organisation
-- ─────────────────────────────────────────
create table if not exists public.tenants (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  slug        text        unique not null,
  created_by  uuid        references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$ begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'tenants_set_updated_at'
  ) then
    create trigger tenants_set_updated_at
      before update on public.tenants
      for each row execute function public.set_updated_at();
  end if;
end $$;

-- ─────────────────────────────────────────
-- 2. tenant_members — user ↔ tenant mapping
-- ─────────────────────────────────────────
create table if not exists public.tenant_members (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references public.tenants(id) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  role        text        not null check (role in ('owner','superuser','manager','user')),
  status      text        not null default 'active' check (status in ('active','invited','disabled')),
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index if not exists tenant_members_tenant_id_idx on public.tenant_members (tenant_id);
create index if not exists tenant_members_user_id_idx   on public.tenant_members (user_id);

-- ─────────────────────────────────────────
-- 3. Add tenant_id to ERP tables
--    (idempotent — each block is safe to
--     re-run; the column is added only when
--     it does not already exist)
-- ─────────────────────────────────────────

-- company_info
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='company_info' and column_name='tenant_id'
  ) then
    alter table public.company_info
      add column tenant_id uuid references public.tenants(id) on delete cascade;
  end if;
end $$;
create index if not exists company_info_tenant_id_idx on public.company_info (tenant_id);

-- coa (chart of accounts)
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='coa' and column_name='tenant_id'
  ) then
    alter table public.coa
      add column tenant_id uuid references public.tenants(id) on delete cascade;
  end if;
end $$;
create index if not exists coa_tenant_id_idx on public.coa (tenant_id);

-- collections
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='collections' and column_name='tenant_id'
  ) then
    alter table public.collections
      add column tenant_id uuid references public.tenants(id) on delete cascade;
  end if;
end $$;
create index if not exists collections_tenant_id_idx on public.collections (tenant_id);

-- vouchers
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='vouchers' and column_name='tenant_id'
  ) then
    alter table public.vouchers
      add column tenant_id uuid references public.tenants(id) on delete cascade;
  end if;
end $$;
create index if not exists vouchers_tenant_id_idx on public.vouchers (tenant_id);

-- journals
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='journals' and column_name='tenant_id'
  ) then
    alter table public.journals
      add column tenant_id uuid references public.tenants(id) on delete cascade;
  end if;
end $$;
create index if not exists journals_tenant_id_idx on public.journals (tenant_id);

-- journal_items
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='journal_items' and column_name='tenant_id'
  ) then
    alter table public.journal_items
      add column tenant_id uuid references public.tenants(id) on delete cascade;
  end if;
end $$;
create index if not exists journal_items_tenant_id_idx on public.journal_items (tenant_id);

-- ─────────────────────────────────────────
-- 4. Row-Level Security helpers
--    Enable RLS on tenant-scoped tables so
--    that each authenticated user can only
--    read/write rows belonging to a tenant
--    they are an active member of.
-- ─────────────────────────────────────────

-- Helper: returns the caller's active tenant_id from tenant_members
create or replace function public.my_tenant_id()
returns uuid language sql stable security definer as $$
  select tenant_id
  from   public.tenant_members
  where  user_id   = auth.uid()
    and  is_active = true
    and  status    = 'active'
  limit 1;
$$;

-- tenants: members can read their own tenant row
alter table public.tenants enable row level security;

drop policy if exists "tenants_select_own" on public.tenants;
create policy "tenants_select_own" on public.tenants
  for select using (
    id = public.my_tenant_id()
  );

-- tenant_members: users can read their own membership row(s)
alter table public.tenant_members enable row level security;

drop policy if exists "tenant_members_select_own" on public.tenant_members;
create policy "tenant_members_select_own" on public.tenant_members
  for select using (
    user_id = auth.uid()
    or tenant_id = public.my_tenant_id()
  );

drop policy if exists "tenant_members_insert_owner" on public.tenant_members;
create policy "tenant_members_insert_owner" on public.tenant_members
  for insert with check (
    tenant_id = public.my_tenant_id()
    and exists (
      select 1 from public.tenant_members m
      where m.tenant_id = public.my_tenant_id()
        and m.user_id   = auth.uid()
        and m.role in ('owner', 'superuser')
        and m.is_active = true
    )
  );
