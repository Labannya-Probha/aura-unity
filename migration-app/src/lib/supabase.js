import { createClient } from '@supabase/supabase-js'

// Credentials are read from the .env file at build time by Vite (see .env.example).
// The anon key (role: "anon") is the public client-side key — it is safe to commit.
const SUPA_URL  = import.meta.env.VITE_SUPABASE_URL
const SUPA_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

export const sb = createClient(SUPA_URL, SUPA_ANON)
