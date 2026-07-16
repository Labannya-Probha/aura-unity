-- Run after the foundation migration. This migration validates only safe constraints.
begin;

-- Existing audit showed all current journals balanced. Validate line-level rules only if data complies.
do $$
begin
  if not exists (
    select 1 from public.journal_items
    where coalesce(debit,0)<0 or coalesce(credit,0)<0
  ) then
    alter table public.journal_items validate constraint journal_item_nonnegative_check;
  end if;

  if not exists (
    select 1 from public.journal_items
    where not (
      (coalesce(debit,0)>0 and coalesce(credit,0)=0)
      or (coalesce(credit,0)>0 and coalesce(debit,0)=0)
    )
  ) then
    alter table public.journal_items validate constraint journal_item_one_side_check;
  end if;
end $$;

alter table public.coa validate constraint coa_normal_balance_check;
alter table public.coa validate constraint coa_financial_statement_check;

commit;
