-- Aura Unity Phase 3: Period Closing & Controls v1
begin;

alter table if exists public.fiscal_years
  add column if not exists status text not null default 'open',
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid;

alter table if exists public.accounting_periods
  add column if not exists status text not null default 'open',
  add column if not exists soft_closed_at timestamptz,
  add column if not exists hard_closed_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid,
  add column if not exists closed_by_name text,
  add column if not exists close_reason text,
  add column if not exists reopen_requested_at timestamptz,
  add column if not exists reopen_requested_by uuid,
  add column if not exists reopen_request_reason text;

update public.accounting_periods set status='open' where status is null;

create table if not exists public.period_close_checklists (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
  period_id uuid not null references public.accounting_periods(id) on delete cascade,
  task_code text not null, task_name text not null, description text, sort_order integer not null default 100,
  is_required boolean not null default true, is_completed boolean not null default false,
  completed_at timestamptz, completed_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(period_id,task_code)
);
create index if not exists idx_period_close_checklists_tenant_period on public.period_close_checklists(tenant_id,period_id);

create table if not exists public.period_close_history (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
  period_id uuid not null references public.accounting_periods(id) on delete cascade,
  from_status text, to_status text not null, action text not null default 'STATUS_CHANGE', reason text,
  performed_by uuid, performed_by_email text, created_at timestamptz not null default now(), metadata jsonb not null default '{}'::jsonb
);
create index if not exists idx_period_close_history_period on public.period_close_history(tenant_id,period_id,created_at desc);

create table if not exists public.period_reopen_requests (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
  period_id uuid not null references public.accounting_periods(id) on delete cascade,
  reason text not null, status text not null default 'pending', requested_by uuid, requested_at timestamptz not null default now(),
  reviewed_by uuid, reviewed_at timestamptz, review_note text
);

create table if not exists public.financial_period_snapshots (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
  period_id uuid not null references public.accounting_periods(id) on delete cascade,
  snapshot_type text not null default 'hard_close', snapshot_data jsonb not null default '{}'::jsonb,
  created_by uuid, created_at timestamptz not null default now(), unique(period_id,snapshot_type)
);

alter table public.period_close_checklists enable row level security;
alter table public.period_close_history enable row level security;
alter table public.period_reopen_requests enable row level security;
alter table public.financial_period_snapshots enable row level security;

do $$ begin
  create policy pc_checklist_tenant_access on public.period_close_checklists for all using (
    exists(select 1 from public.tenant_members tm where tm.tenant_id=period_close_checklists.tenant_id and tm.user_id=auth.uid())
  ) with check (exists(select 1 from public.tenant_members tm where tm.tenant_id=period_close_checklists.tenant_id and tm.user_id=auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy pc_history_tenant_read on public.period_close_history for select using (
    exists(select 1 from public.tenant_members tm where tm.tenant_id=period_close_history.tenant_id and tm.user_id=auth.uid())
  ); exception when duplicate_object then null; end $$;
do $$ begin
  create policy pc_reopen_tenant_access on public.period_reopen_requests for all using (
    exists(select 1 from public.tenant_members tm where tm.tenant_id=period_reopen_requests.tenant_id and tm.user_id=auth.uid())
  ) with check (exists(select 1 from public.tenant_members tm where tm.tenant_id=period_reopen_requests.tenant_id and tm.user_id=auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy pc_snapshot_tenant_read on public.financial_period_snapshots for select using (
    exists(select 1 from public.tenant_members tm where tm.tenant_id=financial_period_snapshots.tenant_id and tm.user_id=auth.uid())
  ); exception when duplicate_object then null; end $$;

create or replace function public.seed_period_close_checklist(p_period_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from accounting_periods where id=p_period_id;
  if v_tenant is null then raise exception 'Accounting period not found'; end if;
  insert into period_close_checklists(tenant_id,period_id,task_code,task_name,description,sort_order) values
  (v_tenant,p_period_id,'BANK_RECON','Complete bank reconciliation','Reconcile all active bank accounts and resolve unmatched items.',10),
  (v_tenant,p_period_id,'CASH_COUNT','Verify physical cash balance','Confirm cash count and obtain custodian sign-off.',20),
  (v_tenant,p_period_id,'AR_REVIEW','Review receivables and collections','Review outstanding balances, ageing and doubtful items.',30),
  (v_tenant,p_period_id,'AP_REVIEW','Review payables and accruals','Record outstanding liabilities and month-end accruals.',40),
  (v_tenant,p_period_id,'JOURNAL_REVIEW','Review draft/submitted journals','Resolve all unposted journals dated within the period.',50),
  (v_tenant,p_period_id,'TB_REVIEW','Review trial balance','Confirm that the trial balance agrees and unusual balances are explained.',60),
  (v_tenant,p_period_id,'FS_REVIEW','Review financial statements','Review Income Statement, Financial Position and Cash Flow.',70),
  (v_tenant,p_period_id,'MANAGEMENT_SIGNOFF','Obtain management sign-off','Document final review and authorization before hard close.',80)
  on conflict(period_id,task_code) do nothing;
end $$;

select public.seed_period_close_checklist(id) from public.accounting_periods;

create or replace function public.validate_accounting_period_close(p_period_id uuid)
returns table(check_name text,result text,details text) language plpgsql security definer set search_path=public as $$
declare p accounting_periods%rowtype; v_count bigint; v_dr numeric; v_cr numeric; v_incomplete bigint;
begin
  select * into p from accounting_periods where id=p_period_id;
  if p.id is null then raise exception 'Accounting period not found'; end if;
  if not exists(select 1 from tenant_members tm where tm.tenant_id=p.tenant_id and tm.user_id=auth.uid()) then raise exception 'Access denied'; end if;
  select count(*) into v_count from journals where tenant_id=p.tenant_id and journal_date between p.start_date and p.end_date and lower(coalesce(status,'draft')) in ('draft','submitted','approved','rejected');
  return query select 'Unposted journals',case when v_count=0 then 'PASS' else 'FAIL' end,case when v_count=0 then 'No unposted journals in the period' else v_count||' journal(s) are not posted' end;
  select coalesce(sum(ji.debit),0),coalesce(sum(ji.credit),0) into v_dr,v_cr from journal_items ji join journals j on j.id=ji.journal_id where j.tenant_id=p.tenant_id and j.journal_date between p.start_date and p.end_date and lower(j.status)='posted';
  return query select 'Journal balance',case when abs(v_dr-v_cr)<0.01 then 'PASS' else 'FAIL' end,'Debit '||v_dr||' / Credit '||v_cr||' / Difference '||abs(v_dr-v_cr);
  select count(*) into v_incomplete from period_close_checklists where period_id=p_period_id and is_required and not is_completed;
  return query select 'Closing checklist',case when v_incomplete=0 then 'PASS' else 'WARN' end,case when v_incomplete=0 then 'All required tasks completed' else v_incomplete||' required task(s) incomplete' end;
  return query select 'Fiscal period date',case when p.start_date<=p.end_date then 'PASS' else 'FAIL' end,p.start_date||' to '||p.end_date;
end $$;

create or replace function public.change_accounting_period_status(p_period_id uuid,p_to_status text,p_reason text default null)
returns accounting_periods language plpgsql security definer set search_path=public as $$
declare p accounting_periods%rowtype; v_from text; v_role text; v_fail bigint;
begin
  select * into p from accounting_periods where id=p_period_id for update;
  if p.id is null then raise exception 'Accounting period not found'; end if;
  select lower(coalesce(role,'')) into v_role from tenant_members where tenant_id=p.tenant_id and user_id=auth.uid() limit 1;
  if v_role is null then raise exception 'Access denied'; end if;
  if p_to_status not in ('open','soft_closed','hard_closed') then raise exception 'Invalid period status'; end if;
  if p_to_status='hard_closed' and v_role not in ('superuser','admin','owner','approver') then raise exception 'Only an approver or administrator may hard close a period'; end if;
  if p.status='hard_closed' and p_to_status='open' then raise exception 'Hard-closed periods require an approved reopen request'; end if;
  if p_to_status='hard_closed' then
    select count(*) into v_fail from public.validate_accounting_period_close(p_period_id) where result='FAIL';
    if v_fail>0 then raise exception 'Period close validation failed'; end if;
  end if;
  v_from=coalesce(p.status,'open');
  update accounting_periods set status=p_to_status,
    soft_closed_at=case when p_to_status='soft_closed' then now() else soft_closed_at end,
    hard_closed_at=case when p_to_status='hard_closed' then now() else hard_closed_at end,
    closed_at=case when p_to_status in ('soft_closed','hard_closed') then now() else null end,
    closed_by=case when p_to_status in ('soft_closed','hard_closed') then auth.uid() else null end,
    closed_by_name=case when p_to_status in ('soft_closed','hard_closed') then coalesce(auth.jwt()->>'email','System User') else null end,
    close_reason=p_reason where id=p_period_id returning * into p;
  insert into period_close_history(tenant_id,period_id,from_status,to_status,action,reason,performed_by,performed_by_email)
  values(p.tenant_id,p.id,v_from,p_to_status,upper(p_to_status),p_reason,auth.uid(),auth.jwt()->>'email');
  if p_to_status='hard_closed' then
    insert into financial_period_snapshots(tenant_id,period_id,snapshot_type,snapshot_data,created_by)
    values(p.tenant_id,p.id,'hard_close',jsonb_build_object('closed_at',now(),'journal_count',(select count(*) from journals where tenant_id=p.tenant_id and journal_date between p.start_date and p.end_date and lower(status)='posted'),'total_debit',(select coalesce(sum(ji.debit),0) from journal_items ji join journals j on j.id=ji.journal_id where j.tenant_id=p.tenant_id and j.journal_date between p.start_date and p.end_date and lower(j.status)='posted')),auth.uid())
    on conflict(period_id,snapshot_type) do update set snapshot_data=excluded.snapshot_data,created_by=excluded.created_by,created_at=now();
  end if;
  return p;
end $$;

create or replace function public.request_accounting_period_reopen(p_period_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $$
declare p accounting_periods%rowtype; rid uuid;
begin
  select * into p from accounting_periods where id=p_period_id;
  if p.id is null or not exists(select 1 from tenant_members where tenant_id=p.tenant_id and user_id=auth.uid()) then raise exception 'Access denied'; end if;
  if p.status<>'hard_closed' then raise exception 'Only hard-closed periods require a reopen request'; end if;
  insert into period_reopen_requests(tenant_id,period_id,reason,requested_by) values(p.tenant_id,p.id,p_reason,auth.uid()) returning id into rid;
  update accounting_periods set reopen_requested_at=now(),reopen_requested_by=auth.uid(),reopen_request_reason=p_reason where id=p.id;
  insert into period_close_history(tenant_id,period_id,from_status,to_status,action,reason,performed_by,performed_by_email) values(p.tenant_id,p.id,p.status,p.status,'REOPEN_REQUESTED',p_reason,auth.uid(),auth.jwt()->>'email');
  return rid;
end $$;

create or replace function public.enforce_open_accounting_period()
returns trigger language plpgsql set search_path=public as $$
declare p_status text;
begin
  select status into p_status from accounting_periods where tenant_id=new.tenant_id and new.journal_date between start_date and end_date order by start_date desc limit 1;
  if p_status='hard_closed' then raise exception 'Accounting period is hard closed for journal date %',new.journal_date; end if;
  if p_status='soft_closed' and lower(coalesce(new.status,'draft')) not in ('draft','rejected') then raise exception 'Accounting period is soft closed; posting workflow is locked for journal date %',new.journal_date; end if;
  return new;
end $$;

drop trigger if exists trg_enforce_open_accounting_period on public.journals;
create trigger trg_enforce_open_accounting_period before insert or update of journal_date,status on public.journals for each row execute function public.enforce_open_accounting_period();

grant execute on function public.validate_accounting_period_close(uuid) to authenticated;
grant execute on function public.change_accounting_period_status(uuid,text,text) to authenticated;
grant execute on function public.request_accounting_period_reopen(uuid,text) to authenticated;
grant execute on function public.seed_period_close_checklist(uuid) to authenticated;

commit;
