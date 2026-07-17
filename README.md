# aura-unity

A static HTML web application.

## Deployment

The main app remains a static site with entry point `index.html` at the repository root.

## Supabase migrations

Database migrations run automatically from GitHub Actions when files under `supabase/migrations/` are pushed to `main`.

Required repository secrets:

- `SUPABASE_ACCESS_TOKEN`: Supabase personal access token.
- `SUPABASE_DB_PASSWORD`: database password for project `ltcjgbhjkfvlzzvvulhz`.

The workflow can also be run manually from GitHub Actions: **Supabase Migrations**.

## Migration sandbox

The React migration sandbox is served from:

- `/migration/index.html`

This includes:

- `Login.jsx` route
- Tenant-aware routes (`/login`, `/<tenantSlug>/login`, `/<tenantSlug>/dashboard`, `/<tenantSlug>/reports`)
- Separate page components in `migration-app/src/pages`
- Reusable UI primitives in `migration-app/src/components/ui`
- Vite-based source app in `migration-app`

### Migration app commands

Run from `/migration-app`:

- `npm install`
- `npm run dev`
- `npm run build`

`npm run build` outputs the static migration app into `/migration`, so it stays deployable as part of the repository static site.

### Vercel

The `vercel.json` file configures Vercel to deploy as a plain static site:
- **Build command:** none
- **Output directory:** `.` (repository root)
- **Framework preset:** Other / none

If deploying via the Vercel dashboard, ensure:
- **Framework Preset** is set to **Other**
- **Build Command** is left **empty**
- **Output Directory** is set to `.`

## Phase 4B Accounts Receivable
The project now includes invoice maker-checker workflow, receipt allocation, customer advances, aging, receipt register and direct print preview. See `PHASE-4B-AR-WORKFLOW-INSTALL.md`.
