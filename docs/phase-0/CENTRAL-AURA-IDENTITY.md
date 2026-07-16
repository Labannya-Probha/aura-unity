# Phase 0 — Central Aura Identity

## Decision

Aura Unity owns the application identity. Supabase Auth is the first authentication provider, not the permanent application data model. UI code consumes `identityClient`; it does not call provider APIs directly.

## Trust boundaries

1. Browser authenticates with the configured identity provider.
2. Browser receives a short-lived provider token.
3. Aura API Gateway validates the token and resolves `aura_identities`.
4. Tenant membership is resolved from `aura_identity_memberships`.
5. Odoo credentials stay server-side and are resolved through `aura_odoo_tenant_bindings.secret_reference`.
6. Odoo never trusts a tenant ID supplied only by the browser.

## Phase 0 data model

- `aura_identities`: provider-neutral person/account identity.
- `aura_identity_memberships`: identity-to-tenant role assignment.
- `aura_odoo_tenant_bindings`: tenant-to-Odoo database/company mapping.
- `aura_identity_audit_log`: authentication and authorization audit events.

## Token contract for the future Aura API Gateway

The gateway should return an internal session containing:

```json
{
  "sub": "<aura_identity_id>",
  "tenant_id": "<active_tenant_id>",
  "role": "accountant",
  "permissions": ["receipt.read", "receipt.create"],
  "session_id": "<opaque-id>"
}
```

Provider access tokens must not be forwarded to Odoo. The gateway uses its own server-side Odoo integration credential.

## Cutover sequence

1. Run the new Supabase migration.
2. Deploy the updated migration app.
3. Verify identity records are created on login.
4. Verify old `tenant_members` data is backfilled.
5. Provision local Odoo with the Phase 0 Docker compose file.
6. Add a tenant binding only through a protected admin/server workflow.
7. Build the Aura API Gateway before any browser-to-Odoo integration.

## Security rules

- Do not store Odoo passwords in browser environment variables.
- Do not expose `secret_reference` values to ordinary users.
- Keep RLS enabled while Supabase remains the identity/control-plane database.
- Rotate the currently published Supabase anon key if project policy requires it; anon keys are public identifiers, while RLS is the actual data boundary.
- Service-role and Odoo integration secrets belong only in server secret storage.
