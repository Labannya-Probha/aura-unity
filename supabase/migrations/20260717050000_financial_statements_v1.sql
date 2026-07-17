-- Aura Unity Financial Statements v1 metadata
-- Safe additive migration: existing COA data remains unchanged.
alter table if exists public.coa add column if not exists statement_subgroup text;
alter table if exists public.coa add column if not exists cash_flow_category text;
alter table if exists public.coa add column if not exists normal_balance text;

update public.coa
set normal_balance = case
  when lower(coalesce(account_group,'')) in ('asset','expense') then 'debit'
  when lower(coalesce(account_group,'')) in ('liability','equity','income','revenue') then 'credit'
  else coalesce(normal_balance,'debit')
end
where normal_balance is null;

alter table if exists public.coa drop constraint if exists coa_normal_balance_check;
alter table if exists public.coa add constraint coa_normal_balance_check check (normal_balance in ('debit','credit'));

alter table if exists public.coa drop constraint if exists coa_cash_flow_category_check;
alter table if exists public.coa add constraint coa_cash_flow_category_check
check (cash_flow_category is null or cash_flow_category in ('operating','investing','financing','cash_equivalent'));

create index if not exists idx_coa_tenant_statement_group on public.coa(tenant_id, account_group, statement_subgroup);
create index if not exists idx_journals_tenant_date_status on public.journals(tenant_id, journal_date, status);
create index if not exists idx_journal_items_journal_account on public.journal_items(journal_id, account_code);
