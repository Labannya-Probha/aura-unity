# aura-unity

A static HTML web application.

## Deployment

The main app remains a static site with entry point `index.html` at the repository root.

## Migration sandbox

The React migration sandbox is served from:

- `/migration/index.html`

This includes:

- `Login.jsx` route
- Basic client-side routing (`/`, `/dashboard`, `/reports` via hash routing)
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