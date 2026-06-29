import { createContext, useCallback, useContext, useEffect, useReducer } from 'react'
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

const RESET_STATE = { tenantId: null, activeMemberRole: null, company: {}, coa: [], tenantResolved: false, resolving: false }

function tenantReducer(state, action) {
  switch (action.type) {
    case 'RESET':
      return RESET_STATE
    case 'RESOLVING':
      return { ...state, resolving: true }
    case 'RESOLVED':
      return { ...state, tenantId: action.tenantId, activeMemberRole: action.role ?? null, tenantResolved: true, resolving: false }
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
  const [state, dispatch] = useReducer(tenantReducer, RESET_STATE)

  const loadCompany = useCallback(async (tid) => {
    const { data } = await readTenantRows(
      'company_info',
      (from) => from.select('setting_key,setting_value'),
      tid,
    )
    if (!data?.length) return
    dispatch({ type: 'COMPANY', company: Object.fromEntries(data.map((r) => [r.setting_key, r.setting_value])) })
  }, [])

  const loadCoa = useCallback(async (tid) => {
    const { data } = await readTenantRows(
      'coa',
      (from) => from.select('*').order('account_code'),
      tid,
    )
    dispatch({ type: 'COA', coa: data || [] })
  }, [])

  useEffect(() => {
    if (!user) {
      dispatch({ type: 'RESET' })
      return
    }

    let cancelled = false
    dispatch({ type: 'RESOLVING' })

    async function resolve() {
      // Primary path: tenant_members (mirrors assets/js/index.js:803-838)
      const membership = await resolveTenantFromMembership(user.id)
      if (cancelled) return

      if (membership) {
        dispatch({ type: 'RESOLVED', tenantId: membership.tenantId, role: membership.role })
        await Promise.all([loadCompany(membership.tenantId), loadCoa(membership.tenantId)])
        return
      }

      // Legacy fallback: tenant_id from Supabase user metadata
      const metaTenant = user.app_metadata?.tenant_id || user.user_metadata?.tenant_id
      if (metaTenant) {
        dispatch({ type: 'RESOLVED', tenantId: metaTenant, role: null })
        await Promise.all([loadCompany(metaTenant), loadCoa(metaTenant)])
        return
      }

      // No tenant found — mark resolved so UI can render appropriately
      if (!cancelled) {
        dispatch({ type: 'RESOLVED', tenantId: null, role: null })
      }
    }

    resolve()
    return () => { cancelled = true }
  }, [user, loadCompany, loadCoa])

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
      (payload) => sb.from('company_info').upsert(payload, { onConflict: 'setting_key' }),
    )
    if (error) throw error
    dispatch({ type: 'COMPANY_MERGE', updates })
  }

  async function saveAccount(account) {
    const payload = tenantInsertPayload(account, state.tenantId)
    const { error } = await writeWithOptionalTenant(
      'coa',
      payload,
      (p) => sb.from('coa').upsert(p, { onConflict: 'account_code' }),
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
