# Aura Unity Journal Workflow UI + Sandbox Tenant

## Included UI workflow

| Journal status | Visible actions |
|---|---|
| Draft / Rejected | Edit, Submit, Delete (authorised user) |
| Submitted | Approve, Reject, View |
| Approved | Post, View |
| Posted | Print, Reconcile, Reverse |
| Reversed / Cancelled | View |

All workflow actions call Supabase RPC functions directly:
- `submit_journal_entry`
- `approve_journal_entry`
- `reject_journal_entry`
- `post_journal_entry`
- `reverse_journal_entry`

No DevTools Console command is required.

## Create the sandbox tenant

Run this SQL in Supabase SQL Editor:

`supabase/manual/create_aura_unity_sandbox_tenant.sql`

It uses the existing users:
- `shahin@app.local` as journal maker
- `superuser@app.local` as approver/poster

## Access sandbox

The current app resolves a tenant from the first URL path segment. After deployment, use:

`https://YOUR-DOMAIN/aura-unity-sandbox/`

Your hosting rewrite must route this path to `index.html`.

## Important

The maker and checker must be different logged-in users. The database prevents the journal submitter from approving the same journal.
