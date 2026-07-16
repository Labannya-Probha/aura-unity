# Aura Unity Journal Posting Engine — Integration Guide

## 1. Apply migration

Run:

`supabase/migrations/20260716150000_journal_posting_workflow.sql`

in Supabase SQL Editor.

## 2. Add the service to `index.html`

Place this before the existing `assets/js/index.js` script:

```html
<script src="/assets/js/services/journalWorkflowService.js?v=20260716"></script>
<script src="/assets/js/index.js?v=20260716"></script>
```

## 3. New journal lifecycle

- New journal: `draft`
- User submits: `submitted`
- Manager approves: `approved`
- Manager posts: `posted`
- Manager may reject submitted entry: `rejected`
- Posted journal correction: `reversed`

## 4. Replace direct posting

Do not run:

```js
sb.from('journals').update({ status: 'posted' })
```

Use:

```js
await journalWorkflowService.submit(journalId, 'Ready for review');
await journalWorkflowService.approve(journalId, 'Checked against supporting documents');
await journalWorkflowService.post(journalId, 'Approved and posted');
```

## 5. Maker-checker rule

The same authenticated user cannot both submit and approve a journal.

Your tenant currently has two members, so assign one person as creator and another as manager/approver.

## 6. Existing journals

Existing 9 journals stay `posted`. They are not changed by this migration.

## 7. Immutability

`enforce_posted_immutability` remains `false` during UI transition.

After every UI save/edit/delete action uses workflow rules, enable it:

```sql
update public.accounting_settings
set enforce_posted_immutability = true,
    updated_at = now();
```
