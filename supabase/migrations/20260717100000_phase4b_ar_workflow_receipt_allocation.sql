-- Aura Unity Phase 4B: AR workflow, receipt allocation, aging and customer statement
begin;

create table if not exists public.ar_workflow_history (
  id bigserial primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_id uuid not null references public.ar_invoices(id) on delete cascade,
  action text not null,
  from_status text,
  to_status text,
  remarks text,
  acted_by uuid default auth.uid(),
  acted_at timestamptz not null default now()
);

alter table public.ar_workflow_history enable row level security;
do $$ begin
  create policy ar_workflow_history_tenant_access on public.ar_workflow_history
  for all using (exists(select 1 from public.tenant_members tm where tm.tenant_id=ar_workflow_history.tenant_id and tm.user_id=auth.uid()))
  with check (exists(select 1 from public.tenant_members tm where tm.tenant_id=ar_workflow_history.tenant_id and tm.user_id=auth.uid()));
exception when duplicate_object then null; end $$;

create sequence if not exists public.ar_receipt_number_seq;

create or replace function public.next_ar_receipt_number(p_tenant_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare n bigint;
begin
  if not exists(select 1 from tenant_members where tenant_id=p_tenant_id and user_id=auth.uid()) then raise exception 'Access denied'; end if;
  n:=nextval('ar_receipt_number_seq');
  return 'AR-MR-'||to_char(current_date,'YYYY')||'-'||lpad(n::text,7,'0');
end $$;

create or replace function public.ar_change_invoice_status(p_invoice_id uuid,p_action text,p_remarks text default null)
returns public.ar_invoices language plpgsql security definer set search_path=public as $$
declare v public.ar_invoices; old_status text; target text;
begin
  select * into v from ar_invoices where id=p_invoice_id for update;
  if v.id is null then raise exception 'Invoice not found'; end if;
  if not exists(select 1 from tenant_members where tenant_id=v.tenant_id and user_id=auth.uid()) then raise exception 'Access denied'; end if;
  old_status:=v.status;
  target:=case lower(p_action) when 'submit' then 'submitted' when 'approve' then 'approved' when 'reject' then 'rejected' when 'post' then 'posted' when 'cancel' then 'cancelled' else null end;
  if target is null then raise exception 'Unsupported action'; end if;
  if lower(p_action)='submit' and old_status<>'draft' then raise exception 'Only draft invoice can be submitted'; end if;
  if lower(p_action) in ('approve','reject') and old_status<>'submitted' then raise exception 'Only submitted invoice can be approved or rejected'; end if;
  if lower(p_action)='post' and old_status<>'approved' then raise exception 'Only approved invoice can be posted'; end if;
  if lower(p_action)='cancel' and old_status in ('paid','cancelled') then raise exception 'Paid/cancelled invoice cannot be cancelled'; end if;
  update ar_invoices set status=target,
    submitted_by=case when target='submitted' then auth.uid() else submitted_by end,
    submitted_at=case when target='submitted' then now() else submitted_at end,
    approved_by=case when target='approved' then auth.uid() else approved_by end,
    approved_at=case when target='approved' then now() else approved_at end,
    posted_by=case when target='posted' then auth.uid() else posted_by end,
    posted_at=case when target='posted' then now() else posted_at end,
    updated_at=now()
  where id=p_invoice_id returning * into v;
  insert into ar_workflow_history(tenant_id,invoice_id,action,from_status,to_status,remarks)
  values(v.tenant_id,v.id,lower(p_action),old_status,target,p_remarks);
  return v;
end $$;

create or replace function public.ar_create_receipt_and_allocate(
  p_customer_id uuid,p_amount numeric,p_payment_mode text default 'cash',p_reference_no text default null,
  p_invoice_id uuid default null,p_receipt_date date default current_date,p_remarks text default null)
returns public.ar_receipts language plpgsql security definer set search_path=public as $$
declare c ar_customers; r ar_receipts; inv ar_invoices; alloc numeric(18,2):=0; rno text;
begin
  if coalesce(p_amount,0)<=0 then raise exception 'Amount must be positive'; end if;
  select * into c from ar_customers where id=p_customer_id;
  if c.id is null then raise exception 'Customer not found'; end if;
  if not exists(select 1 from tenant_members where tenant_id=c.tenant_id and user_id=auth.uid()) then raise exception 'Access denied'; end if;
  rno:=next_ar_receipt_number(c.tenant_id);
  if p_invoice_id is not null then
    select * into inv from ar_invoices where id=p_invoice_id and tenant_id=c.tenant_id and customer_id=c.id for update;
    if inv.id is null then raise exception 'Invoice not found for customer'; end if;
    if inv.status not in ('posted','partially_paid') then raise exception 'Only posted outstanding invoice can receive payment'; end if;
    alloc:=least(p_amount,inv.balance_amount);
  end if;
  insert into ar_receipts(tenant_id,customer_id,receipt_no,receipt_date,payment_mode,reference_no,amount,unallocated_amount,status)
  values(c.tenant_id,c.id,rno,coalesce(p_receipt_date,current_date),coalesce(p_payment_mode,'cash'),p_reference_no,p_amount,p_amount-alloc,'posted') returning * into r;
  if alloc>0 then
    insert into ar_receipt_allocations(tenant_id,receipt_id,invoice_id,allocated_amount) values(c.tenant_id,r.id,inv.id,alloc);
    update ar_invoices set paid_amount=paid_amount+alloc,
      status=case when paid_amount+alloc>=total_amount then 'paid' else 'partially_paid' end,updated_at=now()
    where id=inv.id;
  end if;
  return r;
end $$;

create or replace view public.ar_customer_statement as
select i.tenant_id,i.customer_id,i.invoice_date transaction_date,i.invoice_no reference_no,
       'invoice'::text transaction_type,coalesce(i.description,'Invoice') description,
       i.total_amount debit,0::numeric credit,i.status
from ar_invoices i where i.status in ('posted','partially_paid','paid')
union all
select r.tenant_id,r.customer_id,r.receipt_date,r.receipt_no,'receipt',
       coalesce(r.reference_no,'Payment received'),0::numeric,r.amount,r.status
from ar_receipts r where r.status='posted';

create or replace view public.ar_receipt_register as
select r.*,c.customer_code,c.name customer_name,
       coalesce((select sum(a.allocated_amount) from ar_receipt_allocations a where a.receipt_id=r.id),0) allocated_amount
from ar_receipts r join ar_customers c on c.id=r.customer_id;

commit;
