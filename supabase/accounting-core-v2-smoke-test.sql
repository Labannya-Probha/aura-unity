-- Aura Unity Accounting Core v2 read-only smoke tests

-- 1. Existing journal integrity
select
  j.id,j.ref_no,j.journal_date,j.status,
  j.total_debit,j.total_credit,
  coalesce(sum(ji.debit),0) calculated_debit,
  coalesce(sum(ji.credit),0) calculated_credit,
  coalesce(sum(ji.debit),0)-coalesce(sum(ji.credit),0) difference
from public.journals j
left join public.journal_items ji on ji.journal_id=j.id
group by j.id
order by j.id;

-- 2. Journal status distribution
select tenant_id,status,count(*) as journal_count,sum(total_debit) total_debit,sum(total_credit) total_credit
from public.journals
group by tenant_id,status
order by tenant_id,status;

-- 3. Fiscal periods
select fy.name,fy.start_date,fy.end_date,fy.status,
       ap.period_name,ap.start_date period_start,ap.end_date period_end,ap.status period_status
from public.fiscal_years fy
join public.accounting_periods ap on ap.fiscal_year_id=fy.id
order by ap.start_date;

-- 4. Enhanced COA
select account_code,account_name,account_group,account_type,normal_balance,
       financial_statement,is_control_account,allow_direct_posting,is_active
from public.coa
order by tenant_id,sort_order,account_code;

-- 5. General ledger
select * from public.general_ledger_v2 order by journal_date,journal_id,line_no;
