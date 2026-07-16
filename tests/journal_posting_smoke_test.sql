-- Run after applying the Journal Posting Workflow migration.

-- 1. Workflow columns
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'journals'
  and column_name in (
    'status','submitted_at','submitted_by','approved_at','approved_by',
    'rejected_at','rejected_by','rejection_reason','approval_note',
    'posting_note','workflow_version'
  )
order by ordinal_position;

-- 2. Functions
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'submit_journal_entry',
    'approve_journal_entry',
    'reject_journal_entry',
    'post_journal_entry',
    'reverse_journal_entry'
  )
order by p.proname;

-- 3. Approval enabled
select
  tenant_id,
  require_journal_approval,
  enforce_posted_immutability
from public.accounting_settings;

-- 4. Existing records remain balanced and posted
select
  id,
  ref_no,
  status,
  total_debit,
  total_credit,
  total_debit - total_credit as difference
from public.journals
order by id;

-- 5. Workflow queue
select
  id,
  ref_no,
  status,
  line_count,
  calculated_debit,
  calculated_credit,
  difference
from public.journal_workflow_queue
order by id;
