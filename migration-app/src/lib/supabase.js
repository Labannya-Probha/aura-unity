import { createClient } from '@supabase/supabase-js'

// Credentials are read from the .env file at build time by Vite (see .env.example).
const SUPA_URL  = import.meta.env.VITE_SUPABASE_URL
const SUPA_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPA_URL || !SUPA_ANON) {
  throw new Error(
    'Missing Supabase environment variables. ' +
    'Copy migration-app/.env.example to migration-app/.env and fill in the values.'
  )
}

export const sb = createClient(SUPA_URL, SUPA_ANON)
