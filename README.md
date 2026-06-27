# aura-unity

A static HTML web application.

## Deployment

This is a static site — no build step is required. The entry point is `index.html` at the repository root.

### Vercel

The `vercel.json` file configures Vercel to deploy as a plain static site:
- **Build command:** none
- **Output directory:** `.` (repository root)
- **Framework preset:** Other / none

If deploying via the Vercel dashboard, ensure:
- **Framework Preset** is set to **Other**
- **Build Command** is left **empty**
- **Output Directory** is set to `.`