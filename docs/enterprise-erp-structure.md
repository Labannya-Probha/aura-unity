# Aura Unity ERP Enterprise Structure

## Runtime Layers

- `index.html`: production static ERP shell.
- `assets/css/index.css`: production ERP styling.
- `assets/js/index.js`: production ERP client runtime.
- `supabase/migrations`: authoritative database change history.
- `.github/workflows/supabase-migrations.yml`: automatic migration deployment to Supabase on `main`.
- `migration-app`: React migration sandbox, not the current production ERP runtime.

## Tenant Model

Tenant URLs use a slug path:

```text
https://ais.aurastay.bd/<tenantSlug>/login
```

The browser does not trust the URL alone. It resolves tenant context through:

1. `public.resolve_current_tenant(requested_slug)`
2. `public.tenant_members`
3. Legacy `public.users.tenant_id`, only as a transition fallback inside the database function

Every tenant-owned table must carry `tenant_id`; reads and writes are scoped by that value.

## Data Access Contract

The frontend should not depend on PostgREST embedded relationships for core accounting reports. Enterprise data loads should:

1. Read tenant-scoped base tables.
2. Join in memory for presentation-only needs.
3. Keep database-enforced isolation in RLS.

This avoids breakage when indexes or foreign keys are refactored for tenant-wise uniqueness.

## Supabase Security

- RLS remains enabled on tenant-owned ERP tables.
- `authenticated` receives table privileges, but policies still control visible rows.
- `resolve_current_tenant` is `security definer` and only returns tenants connected to the current authenticated user.
- Service role keys must never be used in browser code.

## Migration Rules

- All schema changes must be committed under `supabase/migrations`.
- GitHub Actions applies migrations automatically after push to `main`.
- Required GitHub secrets:
  - `SUPABASE_ACCESS_TOKEN`
  - `SUPABASE_DB_PASSWORD`
