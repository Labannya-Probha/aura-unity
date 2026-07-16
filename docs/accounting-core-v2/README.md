# Aura Unity Accounting Core v2

This is a non-destructive upgrade of the existing Supabase accounting schema.

## Current audited data preserved

- 38 COA rows
- 9 collections
- 9 balanced journals
- 18 journal lines
- 1 tenant
- 2 tenant memberships

## New capabilities

- Enhanced Chart of Accounts metadata
- Fiscal years and monthly accounting periods
- Journal validation RPC
- Controlled journal posting RPC
- Reversal RPC
- Immutable-posting feature flag
- Accounting audit log
- RLS-aware general ledger view

## Deployment order

1. Back up the Supabase database.
2. Run `20260716130000_accounting_core_v2_foundation.sql`.
3. Run `accounting-core-v2-smoke-test.sql` and confirm every difference is zero.
4. Run `20260716131000_accounting_core_v2_validation.sql`.
5. Add `assets/js/services/accountingService.js` after the Supabase client script.
6. Replace direct journal status updates with `accountingService.postJournal(...)`.
7. After UI reversal support is tested, enable immutability:

```sql
update public.accounting_settings
set enforce_posted_immutability=true,
    updated_at=now(),
    updated_by=auth.uid()
where tenant_id='<YOUR_TENANT_ID>';
```

## Safe rollout

`enforce_posted_immutability` defaults to `false`, so the migration does not immediately break the existing editing UI. Turn it on only after the frontend uses the RPC workflows.

## Journal lifecycle

- `draft`
- `submitted`
- `approved`
- `posted`
- `reversed`
- `cancelled`

Existing journals remain posted and unchanged.
