# Aura Unity Enterprise v2 Modular Architecture

## Runtime order
1. `app.js` creates the shared namespace.
2. `utils/foundation.js` initializes security, Supabase, state and common data helpers.
3. `utils/ui-shell.js` provides authentication, language, navigation and UI shell behavior.
4. Services expose stable facades.
5. Business modules load by domain.
6. Print modules load after business modules.
7. `core.js` performs application bootstrap only.

## Module ownership
- Dashboard: `modules/dashboard/`
- Collections: `modules/collections/`
- Journals and workflow: `modules/journals/`
- Financial statements: `modules/financial/`
- Operational/accounting reports: `modules/reports/`
- Company, COA, users and period closing: `modules/settings/`
- Printing: `print/`
- Shared helpers and UI shell: `utils/`
- Supabase/domain facades: `services/`

## Deployment
Replace the existing project with this package, then commit and push. Existing Supabase migrations remain unchanged.
