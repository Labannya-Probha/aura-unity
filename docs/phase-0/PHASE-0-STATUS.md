# Aura Unity Phase 0 Status

## Implemented in this package

- Central identity provider adapter for React.
- Provider-neutral identity hydration after login.
- Provider-neutral identity, membership, audit, and Odoo-binding schema.
- Migration/backfill from existing Supabase users and tenant memberships.
- Odoo 18 + PostgreSQL 16 local development infrastructure.
- Environment contract that prevents browser-to-Odoo calls.

## Next implementation slice

- Create `apps/api` Aura API Gateway.
- Add JWT validation and active-tenant switching.
- Create permission catalogue and role-to-permission mapping.
- Create first Odoo addon: `aura_unity_core`.
- Add tenant provisioning and Odoo health-check service.
- Replace TenantContext legacy membership resolution with Central Identity memberships after validation.
