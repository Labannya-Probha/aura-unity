import { sb } from './supabase'

function isUUID(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ''))
}

/**
 * Query tenant_members to find the caller's active tenant and role.
 * Returns { tenantId, role } on success, null if no membership found.
 * Mirrors resolveTenantFromMembership() in assets/js/index.js:803-822.
 */
export async function resolveTenantFromMembership(userId) {
  if (!isUUID(userId)) return null
  try {
    const { data, error } = await sb
      .from('tenant_members')
      .select('tenant_id, role')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (!error && data?.tenant_id) {
      return { tenantId: data.tenant_id, role: data.role || 'user' }
    }
  } catch { /* swallow — caller receives null */ }
  return null
}

/** Returns true when the Supabase error indicates the table has no tenant_id column. */
export function hasTenantIdColumnError(error) {
  return error?.code === 'PGRST204' && /\btenant_id\b/i.test(String(error?.message || ''))
}

/** Strip tenant_id from a payload object or array. */
export function removeTenantId(payload) {
  if (Array.isArray(payload)) {
    return payload.map(({ tenant_id: _, ...rest }) => rest)
  }
  if (payload && typeof payload === 'object') {
    const { tenant_id: _, ...rest } = payload
    return rest
  }
  return payload
}

/** Attach tenant_id to a payload object or every item in an array. */
export function tenantInsertPayload(payload, tenantId) {
  if (!tenantId) return payload
  if (Array.isArray(payload)) return payload.map((item) => ({ ...item, tenant_id: tenantId }))
  return { ...payload, tenant_id: tenantId }
}

// Per-table cache: tracks whether the table actually has a tenant_id column.
const tenantColumnSupport = {}

/**
 * Execute a Supabase query scoped to tenantId when available.
 * Falls back to an unscoped query if the table lacks tenant_id.
 * Mirrors readTenantRows() in assets/js/index.js:901-911.
 */
export async function readTenantRows(table, buildQuery, tenantId) {
  if (tenantId && tenantColumnSupport[table] !== false) {
    const scoped = await buildQuery(sb.from(table)).eq('tenant_id', tenantId)
    if (!hasTenantIdColumnError(scoped.error)) return scoped
    tenantColumnSupport[table] = false
  }
  return buildQuery(sb.from(table))
}

/**
 * Execute a write, automatically retrying without tenant_id when the table
 * does not have that column.
 * Mirrors writeWithOptionalTenant() in assets/js/index.js:885-899.
 */
export async function writeWithOptionalTenant(table, payload, executor) {
  const canRetry = Array.isArray(payload)
    ? payload.some((item) => item?.tenant_id != null)
    : payload?.tenant_id != null

  let result = await executor(payload)
  if (canRetry && hasTenantIdColumnError(result?.error)) {
    tenantColumnSupport[table] = false
    result = await executor(removeTenantId(payload))
  }
  return result
}
