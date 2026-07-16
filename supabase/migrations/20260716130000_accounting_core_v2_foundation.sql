-- Aura Unity Accounting Core v2 Foundation
-- Non-destructive upgrade for existing coa/journals/journal_items/collections tables.

begin;

create extension if not exists pgcrypto;

-- =========================================================
-- 1. SETTINGS / FEATURE FLAGS
-- =========================================================
create table if not exists public.accounting_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  base_currency text not null default 'BDT',
  debit_credit_tolerance numeric(18,6) not null default 0.005,
  require_journal_approval boolean not null default false,
  enforce_posted_immutability boolean not null default false,
  allow_soft_closed_adjustments boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.accounting_settings enable row level security;

drop policy if exists accounting_settings_select_member on public.accounting_settings;
create policy accounting_settings_select_member
on public.accounting_settings for select
to authenticated
using (public.is_active_tenant_member(tenant_id));

drop policy if exists accounting_settings_manage_admin on public.accounting_settings;
create policy accounting_settings_manage_admin
on public.accounting_settings for all
to authenticated
using (public.has_tenant_role(tenant_id, array['owner','superuser','manager']))
with check (public.has_tenant_role(tenant_id, array['owner','superuser','manager']));

insert into public.accounting_settings (tenant_id)
select id from public.tenants
on conflict (tenant_id) do nothing;

-- =========================================================
-- 2. COA ENHANCEMENT
-- =========================================================
alter table public.coa
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists parent_account_code varchar(30),
  add column if not exists normal_balance varchar(10),
  add column if not exists account_subtype varchar(50),
  add column if not exists is_control_account boolean not null default false,
  add column if not exists allow_direct_posting boolean not null default true,
  add column if not exists financial_statement varchar(20),
  add column if not exists cash_flow_group varchar(30),
  add column if not exists sort_order integer not null default 0,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references auth.users(id);

update public.coa
set normal_balance = case
  when lower(coalesce(account_group,'')) in ('asset','expense') then 'debit'
  when lower(coalesce(account_group,'')) in ('liability','equity','income','revenue') then 'credit'
  else coalesce(normal_balance, 'debit')
end
where normal_balance is null;

update public.coa
set financial_statement = case
  when lower(coalesce(account_group,'')) in ('income','revenue','expense') then 'income_statement'
  when lower(coalesce(account_group,'')) in ('asset','liability','equity') then 'balance_sheet'
  else financial_statement
end
where financial_statement is null;

create unique index if not exists coa_tenant_account_code_uq
  on public.coa(tenant_id, account_code);
create unique index if not exists coa_id_uq on public.coa(id);
create index if not exists coa_parent_idx on public.coa(tenant_id, parent_account_code);
create index if not exists coa_statement_idx on public.coa(tenant_id, financial_statement, sort_order);

-- Soft validation avoids breaking legacy rows with unusual values.
do $$ begin
  alter table public.coa add constraint coa_normal_balance_check
    check (normal_balance in ('debit','credit')) not valid;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.coa add constraint coa_financial_statement_check
    check (financial_statement is null or financial_statement in ('balance_sheet','income_statement','cash_flow','memorandum')) not valid;
exception when duplicate_object then null; end $$;

-- =========================================================
-- 3. FISCAL YEARS AND PERIODS
-- =========================================================
create table if not exists public.fiscal_years (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  name varchar(40) not null,
  start_date date not null,
  end_date date not null,
  status varchar(15) not null default 'open' check (status in ('draft','open','closed')),
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique (tenant_id, name),
  check (end_date >= start_date)
);

create table if not exists public.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  fiscal_year_id uuid not null references public.fiscal_years(id) on delete cascade,
  period_name varchar(40) not null,
  start_date date not null,
  end_date date not null,
  status varchar(15) not null default 'open' check (status in ('open','soft_closed','closed')),
  locked_at timestamptz,
  locked_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique (tenant_id, fiscal_year_id, period_name),
  check (end_date >= start_date)
);

create index if not exists accounting_period_date_idx
  on public.accounting_periods(tenant_id, start_date, end_date, status);

alter table public.fiscal_years enable row level security;
alter table public.accounting_periods enable row level security;

do $$
begin
  execute 'drop policy if exists fiscal_years_select_member on public.fiscal_years';
  execute 'create policy fiscal_years_select_member on public.fiscal_years for select to authenticated using (public.is_active_tenant_member(tenant_id))';
  execute 'drop policy if exists fiscal_years_manage_admin on public.fiscal_years';
  execute 'create policy fiscal_years_manage_admin on public.fiscal_years for all to authenticated using (public.has_tenant_role(tenant_id, array[''owner'',''superuser'',''manager''])) with check (public.has_tenant_role(tenant_id, array[''owner'',''superuser'',''manager'']))';
  execute 'drop policy if exists accounting_periods_select_member on public.accounting_periods';
  execute 'create policy accounting_periods_select_member on public.accounting_periods for select to authenticated using (public.is_active_tenant_member(tenant_id))';
  execute 'drop policy if exists accounting_periods_manage_admin on public.accounting_periods';
  execute 'create policy accounting_periods_manage_admin on public.accounting_periods for all to authenticated using (public.has_tenant_role(tenant_id, array[''owner'',''superuser'',''manager''])) with check (public.has_tenant_role(tenant_id, array[''owner'',''superuser'',''manager'']))';
end $$;

-- Seed fiscal year covering existing/current data if absent.
insert into public.fiscal_years (tenant_id, name, start_date, end_date, status)
select t.id, 'FY 2026-2027', date '2026-07-01', date '2027-06-30', 'open'
from public.tenants t
where not exists (
  select 1 from public.fiscal_years fy
  where fy.tenant_id=t.id and date '2026-07-16' between fy.start_date and fy.end_date
);

insert into public.accounting_periods (tenant_id, fiscal_year_id, period_name, start_date, end_date, status)
select fy.tenant_id, fy.id, to_char(d, 'YYYY-MM'), d::date, (d + interval '1 month - 1 day')::date, 'open'
from public.fiscal_years fy
cross join lateral generate_series(date_trunc('month', fy.start_date)::date, fy.end_date, interval '1 month') d
where fy.name='FY 2026-2027'
on conflict (tenant_id, fiscal_year_id, period_name) do nothing;

-- =========================================================
-- 4. JOURNAL ENHANCEMENT
-- =========================================================
alter table public.journals
  add column if not exists journal_type varchar(30) not null default 'general',
  add column if not exists source_type varchar(50),
  add column if not exists source_id text,
  add column if not exists source_no varchar(60),
  add column if not exists submitted_at timestamptz,
  add column if not exists submitted_by uuid references auth.users(id),
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id),
  add column if not exists reversal_of integer references public.journals(id) on delete restrict,
  add column if not exists reversed_by_journal_id integer references public.journals(id) on delete restrict,
  add column if not exists reversal_reason text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references auth.users(id);

alter table public.journal_items
  add column if not exists line_no integer,
  add column if not exists description text,
  add column if not exists member_id bigint,
  add column if not exists branch_id uuid,
  add column if not exists cost_center_id uuid,
  add column if not exists project_id uuid,
  add column if not exists due_date date,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists created_by uuid references auth.users(id);

with numbered as (
  select id, row_number() over (partition by journal_id order by id) as rn
  from public.journal_items
  where line_no is null
)
update public.journal_items ji set line_no=n.rn
from numbered n where n.id=ji.id;

create unique index if not exists journals_tenant_ref_uq
  on public.journals(tenant_id, ref_no) where ref_no is not null;
create index if not exists journals_status_date_idx
  on public.journals(tenant_id, status, journal_date);
create index if not exists journals_source_idx
  on public.journals(tenant_id, source_type, source_id);
create unique index if not exists journal_items_line_uq
  on public.journal_items(journal_id, line_no) where line_no is not null;
create index if not exists journal_items_account_idx
  on public.journal_items(tenant_id, account_code);

-- Prevent invalid future lines. Existing rows are preserved and checked later.
do $$ begin
  alter table public.journal_items add constraint journal_item_nonnegative_check
    check (coalesce(debit,0) >= 0 and coalesce(credit,0) >= 0) not valid;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.journal_items add constraint journal_item_one_side_check
    check (
      (coalesce(debit,0) > 0 and coalesce(credit,0) = 0)
      or (coalesce(credit,0) > 0 and coalesce(debit,0) = 0)
    ) not valid;
exception when duplicate_object then null; end $$;

-- =========================================================
-- 5. AUDIT LOG
-- =========================================================
create table if not exists public.accounting_audit_logs (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  entity_type varchar(50) not null,
  entity_id text not null,
  action varchar(40) not null,
  old_data jsonb,
  new_data jsonb,
  reason text,
  performed_by uuid references auth.users(id),
  performed_at timestamptz not null default now(),
  request_id uuid default gen_random_uuid()
);

create index if not exists accounting_audit_entity_idx
  on public.accounting_audit_logs(tenant_id, entity_type, entity_id, performed_at desc);

alter table public.accounting_audit_logs enable row level security;
drop policy if exists accounting_audit_select_authorized on public.accounting_audit_logs;
create policy accounting_audit_select_authorized
on public.accounting_audit_logs for select
to authenticated
using (public.has_tenant_role(tenant_id, array['owner','superuser','manager']));
-- No direct INSERT/UPDATE/DELETE policy: logs are written by controlled functions.

-- =========================================================
-- 6. HELPERS
-- =========================================================
create or replace function public.current_accounting_period_status(
  p_tenant_id uuid,
  p_date date
) returns text
language sql
stable
security invoker
set search_path = public
as $$
  select ap.status
  from public.accounting_periods ap
  where ap.tenant_id=p_tenant_id
    and p_date between ap.start_date and ap.end_date
  order by ap.start_date desc
  limit 1
$$;

create or replace function public.validate_journal_entry(p_journal_id integer)
returns table (
  journal_id integer,
  total_debit numeric,
  total_credit numeric,
  difference numeric,
  is_balanced boolean,
  period_status text,
  is_valid boolean,
  validation_message text
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_j public.journals%rowtype;
  v_dr numeric(18,6);
  v_cr numeric(18,6);
  v_tolerance numeric(18,6);
  v_period text;
begin
  select * into v_j from public.journals where id=p_journal_id;
  if not found then raise exception 'Journal % not found', p_journal_id; end if;
  if not public.is_active_tenant_member(v_j.tenant_id) then raise exception 'Permission denied'; end if;

  select coalesce(sum(coalesce(debit,0)),0), coalesce(sum(coalesce(credit,0)),0)
    into v_dr, v_cr from public.journal_items where journal_items.journal_id=p_journal_id;
  select coalesce(debit_credit_tolerance,0.005) into v_tolerance
    from public.accounting_settings where tenant_id=v_j.tenant_id;
  v_tolerance := coalesce(v_tolerance,0.005);
  v_period := public.current_accounting_period_status(v_j.tenant_id,v_j.journal_date);

  return query select v_j.id, v_dr, v_cr, abs(v_dr-v_cr), abs(v_dr-v_cr)<=v_tolerance,
    v_period,
    (v_dr>0 and abs(v_dr-v_cr)<=v_tolerance and coalesce(v_period,'open')='open'),
    case
      when v_dr<=0 then 'Journal total must be greater than zero'
      when abs(v_dr-v_cr)>v_tolerance then 'Debit and credit are not balanced'
      when v_period is null then 'No accounting period exists for journal date'
      when v_period<>'open' then 'Accounting period is locked: '||v_period
      else 'Valid'
    end;
end $$;

-- =========================================================
-- 7. POSTING RPC
-- =========================================================
create or replace function public.post_journal_entry(
  p_journal_id integer,
  p_reason text default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_j public.journals%rowtype;
  v_check record;
  v_require_approval boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_j from public.journals where id=p_journal_id for update;
  if not found then raise exception 'Journal % not found', p_journal_id; end if;
  if not public.has_tenant_role(v_j.tenant_id,array['owner','superuser','manager']) then
    raise exception 'You do not have journal posting permission';
  end if;
  if v_j.status='posted' then return v_j.id; end if;
  if v_j.status in ('reversed','cancelled') then raise exception 'Journal status % cannot be posted',v_j.status; end if;

  select require_journal_approval into v_require_approval
  from public.accounting_settings where tenant_id=v_j.tenant_id;
  if coalesce(v_require_approval,false) and v_j.status<>'approved' then
    raise exception 'Journal must be approved before posting';
  end if;

  select * into v_check from public.validate_journal_entry(p_journal_id);
  if not v_check.is_valid then raise exception '%',v_check.validation_message; end if;

  update public.journals set
    total_debit=v_check.total_debit,
    total_credit=v_check.total_credit,
    status='posted',
    posted_at=now(),
    posted_by=auth.uid(),
    updated_at=now(),
    updated_by=auth.uid()
  where id=p_journal_id;

  insert into public.accounting_audit_logs(tenant_id,entity_type,entity_id,action,new_data,reason,performed_by)
  values(v_j.tenant_id,'journal',p_journal_id::text,'posted',jsonb_build_object('total_debit',v_check.total_debit,'total_credit',v_check.total_credit),p_reason,auth.uid());

  return p_journal_id;
end $$;

-- =========================================================
-- 8. REVERSAL RPC
-- =========================================================
create or replace function public.reverse_journal_entry(
  p_journal_id integer,
  p_reversal_date date,
  p_reason text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_j public.journals%rowtype;
  v_new_id integer;
  v_ref text;
  v_period text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'Reversal reason is required'; end if;
  select * into v_j from public.journals where id=p_journal_id for update;
  if not found then raise exception 'Journal % not found', p_journal_id; end if;
  if not public.has_tenant_role(v_j.tenant_id,array['owner','superuser','manager']) then raise exception 'Permission denied'; end if;
  if v_j.status<>'posted' then raise exception 'Only posted journals can be reversed'; end if;
  if v_j.reversed_by_journal_id is not null then return v_j.reversed_by_journal_id; end if;

  v_period := public.current_accounting_period_status(v_j.tenant_id,p_reversal_date);
  if v_period is null or v_period<>'open' then raise exception 'Reversal date is not in an open accounting period'; end if;

  v_ref := coalesce(v_j.ref_no,'JV-'||v_j.id::text)||'-REV-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISS');
  insert into public.journals(
    journal_date,ref_no,narration,total_debit,total_credit,tenant_id,status,
    journal_type,source_type,source_id,source_no,reversal_of,reversal_reason,
    posted_at,posted_by,updated_at,updated_by
  ) values (
    p_reversal_date,v_ref,'Reversal: '||coalesce(v_j.narration,v_j.ref_no),
    v_j.total_credit,v_j.total_debit,v_j.tenant_id,'posted',
    'reversal','journal',v_j.id::text,v_j.ref_no,v_j.id,p_reason,
    now(),auth.uid(),now(),auth.uid()
  ) returning id into v_new_id;

  insert into public.journal_items(journal_id,account_code,debit,credit,tenant_id,line_no,description,member_id,branch_id,cost_center_id,project_id,due_date,created_by)
  select v_new_id,account_code,coalesce(credit,0),coalesce(debit,0),tenant_id,line_no,
    'Reversal: '||coalesce(description,''),member_id,branch_id,cost_center_id,project_id,due_date,auth.uid()
  from public.journal_items where journal_id=p_journal_id order by id;

  update public.journals set
    status='reversed',reversed_by_journal_id=v_new_id,reversal_reason=p_reason,
    updated_at=now(),updated_by=auth.uid()
  where id=p_journal_id;

  insert into public.accounting_audit_logs(tenant_id,entity_type,entity_id,action,new_data,reason,performed_by)
  values(v_j.tenant_id,'journal',p_journal_id::text,'reversed',jsonb_build_object('reversal_journal_id',v_new_id),p_reason,auth.uid());

  return v_new_id;
end $$;

-- =========================================================
-- 9. OPTIONAL POSTED IMMUTABILITY TRIGGERS
-- =========================================================
create or replace function public.guard_posted_journal_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare v_lock boolean;
begin
  select enforce_posted_immutability into v_lock
  from public.accounting_settings where tenant_id=old.tenant_id;
  if coalesce(v_lock,false) and old.status in ('posted','reversed') then
    -- Controlled status transition from posted to reversed is allowed only when reversal link is supplied.
    if tg_op='UPDATE' and old.status='posted' and new.status='reversed' and new.reversed_by_journal_id is not null then
      return new;
    end if;
    raise exception 'Posted/reversed journal is immutable. Use reversal workflow.';
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;

drop trigger if exists trg_guard_posted_journal on public.journals;
create trigger trg_guard_posted_journal
before update or delete on public.journals
for each row execute function public.guard_posted_journal_mutation();

create or replace function public.guard_posted_journal_item_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare v_status text; v_tenant uuid; v_lock boolean; v_jid integer;
begin
  v_jid := case when tg_op='DELETE' then old.journal_id else new.journal_id end;
  select status,tenant_id into v_status,v_tenant from public.journals where id=v_jid;
  select enforce_posted_immutability into v_lock from public.accounting_settings where tenant_id=v_tenant;
  if coalesce(v_lock,false) and v_status in ('posted','reversed') then
    raise exception 'Lines of a posted/reversed journal are immutable';
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;

drop trigger if exists trg_guard_posted_journal_item on public.journal_items;
create trigger trg_guard_posted_journal_item
before insert or update or delete on public.journal_items
for each row execute function public.guard_posted_journal_item_mutation();

-- =========================================================
-- 10. GENERAL LEDGER VIEW
-- =========================================================
create or replace view public.general_ledger_v2
with (security_invoker=true)
as
select
  j.tenant_id,
  j.id as journal_id,
  j.journal_date,
  j.ref_no,
  j.journal_type,
  j.source_type,
  j.source_id,
  j.narration,
  ji.id as journal_item_id,
  ji.line_no,
  ji.account_code,
  c.account_name,
  c.account_group,
  c.account_type,
  ji.description,
  coalesce(ji.debit,0)::numeric(18,2) as debit,
  coalesce(ji.credit,0)::numeric(18,2) as credit,
  ji.member_id,
  ji.branch_id,
  ji.cost_center_id,
  ji.project_id,
  j.posted_at,
  j.posted_by
from public.journals j
join public.journal_items ji on ji.journal_id=j.id and ji.tenant_id=j.tenant_id
left join public.coa c on c.tenant_id=ji.tenant_id and c.account_code=ji.account_code
where j.status in ('posted','reversed');

-- RPC permissions: authenticated only.
revoke all on function public.post_journal_entry(integer,text) from public, anon;
grant execute on function public.post_journal_entry(integer,text) to authenticated;
revoke all on function public.reverse_journal_entry(integer,date,text) from public, anon;
grant execute on function public.reverse_journal_entry(integer,date,text) to authenticated;
revoke all on function public.validate_journal_entry(integer) from public, anon;
grant execute on function public.validate_journal_entry(integer) to authenticated;

grant select, insert, update, delete on public.accounting_settings to authenticated;
grant select, insert, update, delete on public.fiscal_years to authenticated;
grant select, insert, update, delete on public.accounting_periods to authenticated;
grant select on public.accounting_audit_logs to authenticated;
grant select on public.general_ledger_v2 to authenticated;

commit;
