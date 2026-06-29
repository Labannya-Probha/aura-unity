import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { sb } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  // undefined = still loading; null = no session
  const [session, setSession] = useState(undefined)
  const [user, setUser] = useState(null)

  useEffect(() => {
    sb.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s ?? null)
      setUser(s?.user ?? null)
    })

    const { data: { subscription } } = sb.auth.onAuthStateChange((_event, s) => {
      setSession(s ?? null)
      setUser(s?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const login = useCallback(async (email, password) => {
    const { data, error } = await sb.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }, [])

  const logout = useCallback(async () => {
    await sb.auth.signOut()
  }, [])

  return (
    <AuthContext.Provider value={{ session, user, login, logout, loading: session === undefined }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
