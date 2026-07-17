# Aura Unity Phase 4A — Accounts Receivable

## Included
- Tenant-isolated customer/member master
- Auto customer codes
- Draft invoice, demand, subscription and opening invoice entry
- Outstanding invoice ledger
- Basic receivable and overdue KPIs
- AR aging and customer balance database views
- RLS policies based on tenant membership
- Modular `receivables` module and `receivableService`

## Install
1. Copy this package over the current Enterprise v2 project.
2. Run `supabase/migrations/20260717090000_phase4a_accounts_receivable.sql` in Supabase SQL Editor.
3. Commit and push.
4. Hard refresh the deployed app.
5. Open **Receivables** from the sidebar.

## Test flow
1. Create a customer/member.
2. Create a draft invoice.
3. Confirm it appears in Outstanding Invoice Ledger.
4. Verify tenant isolation using the Demo/Test tenant.

## Next Phase 4B
- Submit/approve/post invoice workflow
- Receipt entry and allocation
- Partial payment and advance receipt
- Aging report and customer statement
- Journal posting integration


## Patch 4A.1

- Fixed `ar_invoices.journal_id` and `ar_receipts.journal_id` to use `integer`, matching the existing `public.journals.id` type.
- The Money Receipt navigation tab remains removed.
- Clicking **Print** from Collections now opens the receipt print document and immediately launches the browser print preview.
- `money-receipt.html` is retained only as an internal print template; it is not an application module/tab.
