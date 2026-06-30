alter table if exists public.journal_items drop constraint if exists journal_items_account_code_fkey;
alter table if exists public.vouchers drop constraint if exists vouchers_account_code_fkey;
alter table if exists public.coa drop constraint if exists coa_pkey;
alter table if exists public.coa drop constraint if exists coa_tenant_account_code_key;

update public.coa
set tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
where tenant_id is null;

update public.vouchers
set tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
where tenant_id is null;

update public.journal_items ji
set tenant_id = coalesce(j.tenant_id, '00000000-0000-0000-0000-000000000001'::uuid)
from public.journals j
where ji.journal_id = j.id
  and ji.tenant_id is null;

update public.journal_items
set tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
where tenant_id is null;

alter table public.coa alter column tenant_id set not null;
alter table public.coa alter column account_code set not null;
alter table public.vouchers alter column tenant_id set not null;
alter table public.journal_items alter column tenant_id set not null;

alter table public.coa
  add constraint coa_pkey primary key (tenant_id, account_code);

alter table public.vouchers
  add constraint vouchers_tenant_account_code_fkey
  foreign key (tenant_id, account_code)
  references public.coa (tenant_id, account_code);

alter table public.journal_items
  add constraint journal_items_tenant_account_code_fkey
  foreign key (tenant_id, account_code)
  references public.coa (tenant_id, account_code);

create index if not exists vouchers_tenant_account_code_idx on public.vouchers (tenant_id, account_code);
create index if not exists journal_items_tenant_account_code_idx on public.journal_items (tenant_id, account_code);
create index if not exists journal_items_journal_id_idx on public.journal_items (journal_id);
