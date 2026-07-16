-- Aura Unity Accounting Core v2.1
-- Journal Posting Workflow
-- Non-destructive: keeps existing journals and journal_items unchanged.
-- Run after Accounting Core v2 foundation.

begin;

-- -------------------------------------------------------------------
-- 1. Workflow metadata
-- -------------------------------------------------------------------
alter table public.journals
  add column if not exists rejection_reason text,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid references auth.users(id),
  add column if not exists approval_note text,
  add column if not exists posting_note text,
  add column if not exists workflow_version integer not null default 1;

-- Existing historical rows remain posted. New rows should be explicitly draft.
alter table public.journals alter column status set default 'draft';

-- Keep allowed lifecycle values consistent.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.journals'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.journals drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.journals
  add constraint journals_status_check
  check (status in (
    'draft',
    'submitted',
    'approved',
    'rejected',
    'posted',
    'reversed',
    'cancelled'
  ));

create index if not exists idx_journals_tenant_status_date
  on public.journals(tenant_id, status, journal_date desc);

create index if not exists idx_journals_workflow_pending
  on public.journals(tenant_id, submitted_at)
  where status = 'submitted';

-- -------------------------------------------------------------------
-- 2. Workflow history
-- -------------------------------------------------------------------
create table if not exists public.journal_workflow_history (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  journal_id integer not null references public.journals(id) on delete restrict,
  from_status text,
  to_status text not null,
  action text not null,
  note text,
  performed_by uuid references auth.users(id),
  performed_at timestamptz not null default now(),
  request_id uuid not null default gen_random_uuid()
);

create index if not exists idx_journal_workflow_history_journal
  on public.journal_workflow_history(journal_id, performed_at desc);

create index if not exists idx_journal_workflow_history_tenant
  on public.journal_workflow_history(tenant_id, performed_at desc);

alter table public.journal_workflow_history enable row level security;

drop policy if exists "Tenant members read journal workflow" on public.journal_workflow_history;
create policy "Tenant members read journal workflow"
on public.journal_workflow_history
for select
to authenticated
using (public.is_active_tenant_member(tenant_id));

-- No direct insert/update/delete policy. Workflow functions write history.

-- -------------------------------------------------------------------
-- 3. Validation helper view
-- -------------------------------------------------------------------
create or replace view public.journal_workflow_queue
with (security_invoker = true)
as
select
  j.id,
  j.tenant_id,
  j.journal_date,
  j.ref_no,
  j.narration,
  j.journal_type,
  j.status,
  j.total_debit,
  j.total_credit,
  j.submitted_at,
  j.submitted_by,
  j.approved_at,
  j.approved_by,
  j.posted_at,
  j.posted_by,
  j.rejection_reason,
  coalesce(sum(ji.debit), 0)::numeric(18,2) as calculated_debit,
  coalesce(sum(ji.credit), 0)::numeric(18,2) as calculated_credit,
  (
    coalesce(sum(ji.debit), 0)
    - coalesce(sum(ji.credit), 0)
  )::numeric(18,2) as difference,
  count(ji.id)::integer as line_count
from public.journals j
left join public.journal_items ji on ji.journal_id = j.id
group by j.id;

grant select on public.journal_workflow_queue to authenticated;

-- -------------------------------------------------------------------
-- 4. Submit journal
-- -------------------------------------------------------------------
create or replace function public.submit_journal_entry(
  p_journal_id integer,
  p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_j public.journals%rowtype;
  v_check record;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_j
  from public.journals
  where id = p_journal_id
  for update;

  if not found then
    raise exception 'Journal % not found', p_journal_id;
  end if;

  if not public.has_tenant_role(
    v_j.tenant_id,
    array['owner','superuser','manager','user']
  ) then
    raise exception 'You do not have permission to submit this journal';
  end if;

  if v_j.status not in ('draft','rejected') then
    raise exception 'Journal status % cannot be submitted', v_j.status;
  end if;

  select *
  into v_check
  from public.validate_journal_entry(p_journal_id);

  if not v_check.is_valid then
    raise exception '%', v_check.validation_message;
  end if;

  update public.journals
  set
    total_debit = v_check.total_debit,
    total_credit = v_check.total_credit,
    status = 'submitted',
    submitted_at = now(),
    submitted_by = auth.uid(),
    approved_at = null,
    approved_by = null,
    rejected_at = null,
    rejected_by = null,
    rejection_reason = null,
    updated_at = now(),
    updated_by = auth.uid(),
    workflow_version = workflow_version + 1
  where id = p_journal_id;

  insert into public.journal_workflow_history(
    tenant_id, journal_id, from_status, to_status,
    action, note, performed_by
  )
  values(
    v_j.tenant_id, p_journal_id, v_j.status, 'submitted',
    'submit', p_note, auth.uid()
  );

  insert into public.accounting_audit_logs(
    tenant_id, entity_type, entity_id, action,
    old_data, new_data, reason, performed_by
  )
  values(
    v_j.tenant_id,
    'journal',
    p_journal_id::text,
    'submitted',
    jsonb_build_object('status', v_j.status),
    jsonb_build_object(
      'status', 'submitted',
      'total_debit', v_check.total_debit,
      'total_credit', v_check.total_credit
    ),
    p_note,
    auth.uid()
  );

  return p_journal_id;
end;
$$;

revoke all on function public.submit_journal_entry(integer,text) from public;
grant execute on function public.submit_journal_entry(integer,text) to authenticated;

-- -------------------------------------------------------------------
-- 5. Approve journal
-- -------------------------------------------------------------------
create or replace function public.approve_journal_entry(
  p_journal_id integer,
  p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_j public.journals%rowtype;
  v_check record;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_j
  from public.journals
  where id = p_journal_id
  for update;

  if not found then
    raise exception 'Journal % not found', p_journal_id;
  end if;

  if not public.has_tenant_role(
    v_j.tenant_id,
    array['owner','superuser','manager']
  ) then
    raise exception 'Only an authorised approver can approve journals';
  end if;

  if v_j.status <> 'submitted' then
    raise exception 'Only submitted journals can be approved';
  end if;

  if v_j.submitted_by = auth.uid() then
    raise exception 'Maker-checker control: submitter cannot approve the same journal';
  end if;

  select *
  into v_check
  from public.validate_journal_entry(p_journal_id);

  if not v_check.is_valid then
    raise exception '%', v_check.validation_message;
  end if;

  update public.journals
  set
    total_debit = v_check.total_debit,
    total_credit = v_check.total_credit,
    status = 'approved',
    approved_at = now(),
    approved_by = auth.uid(),
    approval_note = p_note,
    updated_at = now(),
    updated_by = auth.uid(),
    workflow_version = workflow_version + 1
  where id = p_journal_id;

  insert into public.journal_workflow_history(
    tenant_id, journal_id, from_status, to_status,
    action, note, performed_by
  )
  values(
    v_j.tenant_id, p_journal_id, 'submitted', 'approved',
    'approve', p_note, auth.uid()
  );

  insert into public.accounting_audit_logs(
    tenant_id, entity_type, entity_id, action,
    old_data, new_data, reason, performed_by
  )
  values(
    v_j.tenant_id,
    'journal',
    p_journal_id::text,
    'approved',
    jsonb_build_object('status', 'submitted'),
    jsonb_build_object('status', 'approved'),
    p_note,
    auth.uid()
  );

  return p_journal_id;
end;
$$;

revoke all on function public.approve_journal_entry(integer,text) from public;
grant execute on function public.approve_journal_entry(integer,text) to authenticated;

-- -------------------------------------------------------------------
-- 6. Reject journal
-- -------------------------------------------------------------------
create or replace function public.reject_journal_entry(
  p_journal_id integer,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_j public.journals%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if nullif(trim(coalesce(p_reason,'')), '') is null then
    raise exception 'Rejection reason is required';
  end if;

  select *
  into v_j
  from public.journals
  where id = p_journal_id
  for update;

  if not found then
    raise exception 'Journal % not found', p_journal_id;
  end if;

  if not public.has_tenant_role(
    v_j.tenant_id,
    array['owner','superuser','manager']
  ) then
    raise exception 'Only an authorised approver can reject journals';
  end if;

  if v_j.status <> 'submitted' then
    raise exception 'Only submitted journals can be rejected';
  end if;

  update public.journals
  set
    status = 'rejected',
    rejected_at = now(),
    rejected_by = auth.uid(),
    rejection_reason = p_reason,
    approved_at = null,
    approved_by = null,
    updated_at = now(),
    updated_by = auth.uid(),
    workflow_version = workflow_version + 1
  where id = p_journal_id;

  insert into public.journal_workflow_history(
    tenant_id, journal_id, from_status, to_status,
    action, note, performed_by
  )
  values(
    v_j.tenant_id, p_journal_id, 'submitted', 'rejected',
    'reject', p_reason, auth.uid()
  );

  insert into public.accounting_audit_logs(
    tenant_id, entity_type, entity_id, action,
    old_data, new_data, reason, performed_by
  )
  values(
    v_j.tenant_id,
    'journal',
    p_journal_id::text,
    'rejected',
    jsonb_build_object('status', 'submitted'),
    jsonb_build_object('status', 'rejected'),
    p_reason,
    auth.uid()
  );

  return p_journal_id;
end;
$$;

revoke all on function public.reject_journal_entry(integer,text) from public;
grant execute on function public.reject_journal_entry(integer,text) to authenticated;

-- -------------------------------------------------------------------
-- 7. Posting policy activation
-- -------------------------------------------------------------------
-- Maker-checker approval is enabled for all current tenants.
insert into public.accounting_settings(
  tenant_id,
  require_journal_approval,
  enforce_posted_immutability,
  updated_at
)
select
  t.id,
  true,
  false,
  now()
from public.tenants t
on conflict (tenant_id)
do update set
  require_journal_approval = true,
  updated_at = now();

-- Existing post_journal_entry() already enforces approval when this flag is true.
-- Keep posted immutability false until the current UI is switched to the RPC workflow.

commit;
