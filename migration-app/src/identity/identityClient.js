import { sb } from '@/lib/supabase'

/**
 * Central Aura Identity client.
 *
 * Phase 0 uses Supabase Auth as the identity provider, but the rest of the
 * application depends only on this contract. A future Auth0/Keycloak/Aura IAM
 * implementation can replace this file without rewriting page components.
 */
export const identityClient = {
  async getSession() {
    const { data, error } = await sb.auth.getSession()
    if (error) throw error
    return data.session ?? null
  },

  onSessionChange(callback) {
    const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
      callback(session ?? null)
    })
    return () => subscription.unsubscribe()
  },

  async signIn({ email, password }) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  },

  async signOut() {
    const { error } = await sb.auth.signOut()
    if (error) throw error
  },

  async getAccessToken() {
    const session = await this.getSession()
    return session?.access_token ?? null
  },
}
