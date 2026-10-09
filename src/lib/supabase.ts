import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Solo valores públicos. La clave de servicio (service_role) NUNCA debe llegar al frontend.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined
export const STUDY_CODE = (import.meta.env.VITE_STUDY_CODE as string | undefined) ?? 'lo-reenviarias'

export const isConfigured = Boolean(url && key)

function assertPublicKey(k: string) {
  // Defensa adicional: si alguien pega por error una clave privilegiada, la app se niega a arrancar.
  if (k.startsWith('sb_secret_')) throw new Error('Clave secreta detectada en el frontend')
  const parts = k.split('.')
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
      if (payload.role && payload.role !== 'anon') throw new Error('Clave privilegiada detectada en el frontend')
    } catch (e) {
      if (e instanceof Error && e.message.includes('privilegiada')) throw e
    }
  }
}

let client: SupabaseClient | null = null
export function supabase(): SupabaseClient {
  if (!url || !key) throw new Error('Supabase no está configurado (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY)')
  if (!client) {
    assertPublicKey(key)
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'lr-admin-auth' },
    })
  }
  return client
}
