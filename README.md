# aura-unity

A static HTML web application.

## Deployment

This is a static site — no build step is required. The entry point is `index.html` at the repository root.

## Migration sandbox

Initial `shadcn/ui` style migration scaffolding is available at:

- `/migration/index.html`

This includes:

- `Login.jsx` route
- Basic client-side routing (`/`, `/dashboard`, `/reports` via hash routing)
- Separate page components under `/migration/pages`
- Reusable UI primitives under `/migration/components`

### Vercel

The `vercel.json` file configures Vercel to deploy as a plain static site:
- **Build command:** none
- **Output directory:** `.` (repository root)
- **Framework preset:** Other / none

If deploying via the Vercel dashboard, ensure:
- **Framework Preset** is set to **Other**
- **Build Command** is left **empty**
- **Output Directory** is set to `.`