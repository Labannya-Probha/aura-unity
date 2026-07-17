# Aura Unity Phase 3 — Period Closing & Controls v1

## What this phase adds

- Fiscal year and accounting-period control center
- Open, soft-closed and hard-closed period states
- Back-dated journal lock at database level
- Month-end closing checklist
- Automated close validation
- Approval-oriented hard-close and reopen-request controls
- Immutable closing history
- Financial period snapshot on hard close
- Tenant-aware RLS and RPC authorization

## Installation

1. Back up the current project and Supabase database.
2. Extract this ZIP over the existing Aura Unity project and replace matching files.
3. In Supabase SQL Editor, run:

   `supabase/migrations/20260717070000_period_closing_controls_v1.sql`

4. Deploy the updated project.
5. Hard-refresh the browser with `Ctrl + Shift + R`.
6. Open **Setup → Period Closing**.

## Recommended test

1. Select the current month.
2. Complete checklist items.
3. Run validation.
4. Soft close the period.
5. Confirm Draft journals may still be prepared but cannot be posted.
6. Hard close using an Admin/Superuser/Approver account.
7. Confirm all journals dated in that period are blocked.
8. Submit a reopen request and verify it appears in history.

## Important

Hard close is intentionally restrictive. Test first in `demo-test-tenant` before using it in the production tenant.
