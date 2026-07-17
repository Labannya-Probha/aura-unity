-- Aura Unity Phase 4A: Accounts Receivable foundation
begin;

create table if not exists public.ar_customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_code text not null,
  customer_type text not null default 'member' check (customer_type in ('member','customer','donor','sponsor','other')),
  name text not null,
  phone text,
  email text,
  address text,
  opening_balance numeric(18,2) not null default 0,
  credit_limit numeric(18,2) not null default 0,
  payment_terms_days integer not null default 30,
  status text not null default 'active' check (status in ('active','inactive','blocked')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, customer_code)
);

create table if not exists public.ar_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.ar_customers(id),
  invoice_no text not null,
  invoice_date date not null default current_date,
  due_date date not null,
  invoice_type text not null default 'invoice' check (invoice_type in ('invoice','demand','subscription','opening')),
  description text,
  subtotal numeric(18,2) not null default 0,
  discount_amount numeric(18,2) not null default 0,
  tax_amount numeric(18,2) not null default 0,
  total_amount numeric(18,2) not null default 0,
  paid_amount numeric(18,2) not null default 0,
  balance_amount numeric(18,2) generated always as (greatest(total_amount-paid_amount,0)) stored,
  status text not null default 'draft' check (status in ('draft','submitted','approved','posted','partially_paid','paid','cancelled','rejected')),
  journal_id integer references public.journals(id),
  created_by uuid default auth.uid(),
  submitted_by uuid,
  submitted_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  posted_by uuid,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, invoice_no)
);

create table if not exists public.ar_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_id uuid not null references public.ar_invoices(id) on delete cascade,
  line_no integer not null default 1,
  description text not null,
  quantity numeric(18,4) not null default 1,
  unit_rate numeric(18,2) not null default 0,
  line_amount numeric(18,2) generated always as (round(quantity*unit_rate,2)) stored,
  revenue_account_code text,
  created_at timestamptz not null default now()
);

create table if not exists public.ar_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.ar_customers(id),
  receipt_no text not null,
  receipt_date date not null default current_date,
  payment_mode text not null default 'cash',
  reference_no text,
  amount numeric(18,2) not null check (amount > 0),
  unallocated_amount numeric(18,2) not null default 0,
  status text not null default 'posted' check (status in ('draft','posted','cancelled')),
  journal_id integer references public.journals(id),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique(tenant_id, receipt_no)
);

create table if not exists public.ar_receipt_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  receipt_id uuid not null references public.ar_receipts(id) on delete cascade,
  invoice_id uuid not null references public.ar_invoices(id) on delete cascade,
  allocated_amount numeric(18,2) not null check (allocated_amount > 0),
  allocated_at timestamptz not null default now(),
  allocated_by uuid default auth.uid(),
  unique(receipt_id, invoice_id)
);

create index if not exists idx_ar_customers_tenant_name on public.ar_customers(tenant_id,name);
create index if not exists idx_ar_invoices_tenant_customer on public.ar_invoices(tenant_id,customer_id,invoice_date desc);
create index if not exists idx_ar_invoices_due on public.ar_invoices(tenant_id,due_date,status);
create index if not exists idx_ar_receipts_customer on public.ar_receipts(tenant_id,customer_id,receipt_date desc);

alter table public.ar_customers enable row level security;
alter table public.ar_invoices enable row level security;
alter table public.ar_invoice_lines enable row level security;
alter table public.ar_receipts enable row level security;
alter table public.ar_receipt_allocations enable row level security;

do $$ declare t text; begin
  foreach t in array array['ar_customers','ar_invoices','ar_invoice_lines','ar_receipts','ar_receipt_allocations'] loop
    execute format('create policy %I on public.%I for all using (exists(select 1 from public.tenant_members tm where tm.tenant_id=%I.tenant_id and tm.user_id=auth.uid())) with check (exists(select 1 from public.tenant_members tm where tm.tenant_id=%I.tenant_id and tm.user_id=auth.uid()))', t||'_tenant_access', t, t, t);
  end loop;
exception when duplicate_object then null; end $$;

create sequence if not exists public.ar_invoice_number_seq;
create sequence if not exists public.ar_customer_number_seq;

create or replace function public.next_ar_customer_code(p_tenant_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare n bigint;
begin
  if not exists(select 1 from tenant_members where tenant_id=p_tenant_id and user_id=auth.uid()) then raise exception 'Access denied'; end if;
  n:=nextval('ar_customer_number_seq');
  return 'CUS-'||to_char(current_date,'YYYY')||'-'||lpad(n::text,6,'0');
end $$;

create or replace function public.next_ar_invoice_number(p_tenant_id uuid,p_invoice_type text default 'invoice')
returns text language plpgsql security definer set search_path=public as $$
declare n bigint; prefix text;
begin
  if not exists(select 1 from tenant_members where tenant_id=p_tenant_id and user_id=auth.uid()) then raise exception 'Access denied'; end if;
  n:=nextval('ar_invoice_number_seq');
  prefix:=case lower(coalesce(p_invoice_type,'invoice')) when 'demand' then 'DEM' when 'subscription' then 'SUB' when 'opening' then 'OPN' else 'INV' end;
  return prefix||'-'||to_char(current_date,'YYYY')||'-'||lpad(n::text,7,'0');
end $$;

create or replace view public.ar_customer_balances as
select c.tenant_id,c.id customer_id,c.customer_code,c.name,
       c.opening_balance + coalesce(sum(case when i.status in ('posted','partially_paid','paid') then i.total_amount else 0 end),0)
       - coalesce(sum(case when i.status in ('posted','partially_paid','paid') then i.paid_amount else 0 end),0) as outstanding_balance,
       coalesce(sum(case when i.status in ('posted','partially_paid') and i.due_date<current_date then i.balance_amount else 0 end),0) as overdue_balance
from public.ar_customers c left join public.ar_invoices i on i.customer_id=c.id and i.tenant_id=c.tenant_id
group by c.tenant_id,c.id,c.customer_code,c.name,c.opening_balance;

create or replace view public.ar_aging_summary as
select i.tenant_id,i.customer_id,c.customer_code,c.name,
 sum(case when current_date-i.due_date<=0 then i.balance_amount else 0 end) current_due,
 sum(case when current_date-i.due_date between 1 and 30 then i.balance_amount else 0 end) bucket_1_30,
 sum(case when current_date-i.due_date between 31 and 60 then i.balance_amount else 0 end) bucket_31_60,
 sum(case when current_date-i.due_date between 61 and 90 then i.balance_amount else 0 end) bucket_61_90,
 sum(case when current_date-i.due_date>90 then i.balance_amount else 0 end) bucket_90_plus,
 sum(i.balance_amount) total_outstanding
from public.ar_invoices i join public.ar_customers c on c.id=i.customer_id
where i.status in ('posted','partially_paid') and i.balance_amount>0
group by i.tenant_id,i.customer_id,c.customer_code,c.name;

commit;
