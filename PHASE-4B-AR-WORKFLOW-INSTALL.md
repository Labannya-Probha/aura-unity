# Aura Unity Phase 4B — AR Workflow, Receipt Allocation & Aging

## Included
- Invoice workflow: Draft → Submitted → Approved/Rejected → Posted
- Partial and full receipt allocation
- Customer advance/unallocated amount
- AR aging buckets
- Receipt register
- Direct browser print preview from the Print action
- No separate Money Receipt sidebar tab
- Tenant-scoped RLS and RPC validation

## Installation
1. Back up the current repository and database.
2. Copy this package over the current Phase 4A.1 project.
3. Run in Supabase SQL Editor:

```sql
supabase/migrations/20260717100000_phase4b_ar_workflow_receipt_allocation.sql
```

4. Deploy the updated repository.
5. Hard refresh the browser with `Ctrl + Shift + R`.

## Test flow
1. Create customer.
2. Create draft invoice.
3. Submit invoice.
4. Approve invoice.
5. Post invoice.
6. Click Receive, enter partial/full payment.
7. Receipt is saved and its native print preview opens automatically.
8. Verify Aging and Receipt Register.

## Important
The corrected Phase 4A migration uses `integer` for `journal_id`, matching the existing `journals.id` type.
