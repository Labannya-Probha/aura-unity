# Aura Unity — Financial Statements v1

## Included
- Trial Balance with opening, period movement, and closing columns
- Income Statement with operating revenue, cost, gross profit, expenses, and net result
- Statement of Financial Position with current/non-current grouping and balance validation
- Statement of Cash Flows with operating/investing/financing classification
- Posted-journal-only reporting
- Tenant-aware data access through the existing Supabase helper
- Existing PDF/Print and Excel actions

## Install
1. Back up the current project.
2. Extract this ZIP over the existing project and replace files.
3. Run `supabase/migrations/20260717050000_financial_statements_v1.sql` in Supabase SQL Editor.
4. Commit and deploy.
5. Hard refresh with `Ctrl + Shift + R`.

## Recommended COA mapping
Set `statement_subgroup` and `cash_flow_category` for more accurate grouping. If these are empty, Financial Statements v1 uses safe account-name/type heuristics.
