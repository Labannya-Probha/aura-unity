import { createContext, useCallback, useContext, useEffect, useReducer } from 'react'
import { useLocation } from 'react-router-dom'
import { sb } from '../lib/supabase'
import {
  resolveTenantFromMembership,
  readTenantRows,
  tenantInsertPayload,
  writeWithOptionalTenant,
} from '../lib/tenant'
import { useAuth } from './AuthContext'

const TenantContext = createContext(null)

const MEMBER_ROLE_LABELS = {
  owner: 'Owner',
  superuser: 'Super User',
  manager: 'Manager',
  user: 'User',
}

const RESET_STATE = { tenantId: null, tenantSlug: null, activeMemberRole: null, company: {}, coa: [], tenantResolved: false, resolving: false }

function tenantReducer(state, action) {
  switch (action.type) {
    case 'RESET':
      return RESET_STATE
    case 'RESOLVING':
      return { ...state, resolving: true }
    case 'RESOLVED':
      return { ...state, tenantId: action.tenantId, tenantSlug: action.tenantSlug ?? state.tenantSlug, activeMemberRole: action.role ?? null, tenantResolved: true, resolving: false }
    case 'COMPANY':
      return { ...state, company: action.company }
    case 'COMPANY_MERGE':
      return { ...state, company: { ...state.company, ...action.updates } }
    case 'COA':
      return { ...state, coa: action.coa }
    default:
      return state
  }
}

export function TenantProvider({ children }) {
  const { user } = useAuth()
  const location = useLocation()
  const pathParts = location.pathname.split('/').filter(Boolean)
  const tenantSlug = pathParts.length >= 2 && ['login', 'dashboard', 'reports'].includes(pathParts[1])
    ? pathParts[0]
    : null
  const [state, dispatch] = useReducer(tenantReducer, RESET_STATE)

  const loadCompany = useCallback(async (tid, signal) => {
    const { data } = await readTenantRows(
      'company_info',
      (from) => from.select('setting_key,setting_value'),
      tid,
    )
    if (signal?.aborted) return
    if (!data?.length) return
    dispatch({ type: 'COMPANY', company: Object.fromEntries(data.map((r) => [r.setting_key, r.setting_value])) })
  }, [])

  const loadCoa = useCallback(async (tid, signal) => {
    const { data } = await readTenantRows(
      'coa',
      (from) => from.select('*').order('account_code'),
      tid,
    )
    if (signal?.aborted) return
    dispatch({ type: 'COA', coa: data || [] })
  }, [])

  useEffect(() => {
    if (!user) {
      dispatch({ type: 'RESET' })
      return
    }

    const controller = new AbortController()
    const { signal } = controller
    dispatch({ type: 'RESOLVING' })

    async function resolve() {
      // Primary path: tenant_members (mirrors assets/js/index.js:803-838)
      const membership = await resolveTenantFromMembership(user.id, tenantSlug)
      if (signal.aborted) return

      if (membership) {
        dispatch({ type: 'RESOLVED', tenantId: membership.tenantId, tenantSlug: membership.tenantSlug || tenantSlug || null, role: membership.role })
        await Promise.all([loadCompany(membership.tenantId, signal), loadCoa(membership.tenantId, signal)])
        return
      }

      if (tenantSlug) {
        dispatch({ type: 'RESOLVED', tenantId: null, tenantSlug, role: null })
        return
      }

      // Legacy fallback: tenant_id from Supabase user metadata
      const metaTenant = user.app_metadata?.tenant_id || user.user_metadata?.tenant_id
      if (metaTenant) {
        dispatch({ type: 'RESOLVED', tenantId: metaTenant, tenantSlug: null, role: null })
        await Promise.all([loadCompany(metaTenant, signal), loadCoa(metaTenant, signal)])
        return
      }

      // No tenant found — mark resolved so UI can render appropriately
      if (!signal.aborted) {
        dispatch({ type: 'RESOLVED', tenantId: null, tenantSlug: tenantSlug || null, role: null })
      }
    }

    resolve()
    return () => { controller.abort() }
  }, [user, tenantSlug, loadCompany, loadCoa])

  async function saveCompany(updates) {
    const rows = tenantInsertPayload(
      Object.keys(updates).map((k) => ({
        setting_key: k,
        setting_value: updates[k],
        updated_at: new Date().toISOString(),
      })),
      state.tenantId,
    )
    const { error } = await writeWithOptionalTenant(
      'company_info',
      rows,
      (payload) => sb.from('company_info').upsert(payload, {
        onConflict: state.tenantId ? 'tenant_id,setting_key' : 'setting_key',
      }),
    )
    if (error) throw error
    dispatch({ type: 'COMPANY_MERGE', updates })
  }

  async function saveAccount(account) {
    const payload = tenantInsertPayload(account, state.tenantId)
    const { error } = await writeWithOptionalTenant(
      'coa',
      payload,
      (p) => sb.from('coa').upsert(p, {
        onConflict: state.tenantId ? 'tenant_id,account_code' : 'account_code',
      }),
    )
    if (error) throw error
    await loadCoa(state.tenantId)
  }

  function isSuperUser() {
    return state.activeMemberRole === 'owner' || state.activeMemberRole === 'superuser'
  }

  const roleLabel = MEMBER_ROLE_LABELS[state.activeMemberRole] || state.activeMemberRole || ''

  return (
    <TenantContext.Provider
      value={{
        tenantId: state.tenantId,
        tenantSlug: state.tenantSlug,
        activeMemberRole: state.activeMemberRole,
        roleLabel,
        company: state.company,
        coa: state.coa,
        tenantResolved: state.tenantResolved,
        resolving: state.resolving,
        isSuperUser,
        refreshCompany: () => loadCompany(state.tenantId),
        refreshCoa: () => loadCoa(state.tenantId),
        saveCompany,
        saveAccount,
      }}
    >
      {children}
    </TenantContext.Provider>
  )
}

export function useTenant() {
  return useContext(TenantContext)
}
