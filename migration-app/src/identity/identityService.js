import { sb } from '@/lib/supabase'

export async function ensureAuraIdentity(user) {
  if (!user?.id) return null

  const payload = {
    provider: 'supabase',
    provider_subject: user.id,
    primary_email: user.email ?? null,
    display_name: user.user_metadata?.full_name ?? user.email ?? null,
    avatar_url: user.user_metadata?.avatar_url ?? null,
    status: 'active',
    last_login_at: new Date().toISOString(),
  }

  const { data, error } = await sb
    .from('aura_identities')
    .upsert(payload, { onConflict: 'provider,provider_subject' })
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function listIdentityMemberships(identityId) {
  if (!identityId) return []
  const { data, error } = await sb
    .from('aura_identity_memberships')
    .select('id,tenant_id,role,status,is_default,tenants(id,name,slug)')
    .eq('identity_id', identityId)
    .eq('status', 'active')
    .order('is_default', { ascending: false })
  if (error) throw error
  return data ?? []
}
