import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { DecisionRow, OpenResponseRow, SessionRow } from '../analytics/types'
import { DEFAULT_FILTERS, type Filters } from '../analytics/metrics'

const PAGE = 1000

/** Descarga TODAS las filas de una vista paginando, y verifica contra count exacto (sin truncamiento silencioso). */
export async function fetchAll<T>(view: string, order: string): Promise<{ rows: T[]; expected: number }> {
  const sb = supabase()
  const head = await sb.from(view).select('*', { count: 'exact', head: true })
  if (head.error) throw head.error
  const expected = head.count ?? 0
  const rows: T[] = []
  for (let from = 0; from < expected; from += PAGE) {
    const { data, error } = await sb.from(view).select('*').order(order, { ascending: true }).range(from, Math.min(from + PAGE, expected) - 1)
    if (error) throw error
    rows.push(...(data as T[]))
    if (!data || data.length === 0) break
  }
  if (rows.length !== expected) throw new Error(`Descarga incompleta de ${view}: ${rows.length} de ${expected} filas. Vuelve a cargar.`)
  return { rows, expected }
}

export type NewsItemRow = {
  id: string; item_key: string; headline: string; is_real: boolean; category: string; source_name: string | null; source_url: string | null
  source_published_on: string | null; explanation: string; hint: string; validation_status: string; validation_notes: string | null; study_id: string
}
export type StudyRow = { id: string; code: string; version: string; title: string; status: string; config: Record<string, unknown>; changelog: string | null; description: string | null }

export type ResearchData = {
  sessions: SessionRow[]
  decisions: DecisionRow[]
  openResponses: OpenResponseRow[]
  items: NewsItemRow[]
  studies: StudyRow[]
  /** Sesiones (sin pruebas) por versión, incluidas las de la 4.x */
  sessionCounts: Record<string, number>
  loadedAt: Date
}

export type AdminProfile = { user_id: string; role: 'owner' | 'analyst' | 'viewer'; display_name: string | null }

type Ctx = {
  data: ResearchData | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  filters: Filters
  setFilters: (f: Filters) => void
  profile: AdminProfile
}
export const DataContext = createContext<Ctx | null>(null)
export const useData = () => {
  const c = useContext(DataContext)
  if (!c) throw new Error('DataContext ausente')
  return c
}

export function useResearchDataState(profile: AdminProfile): Ctx {
  const [data, setData] = useState<ResearchData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const sb = supabase()
      const [s, d, o, items, studies] = await Promise.all([
        fetchAll<SessionRow>('v_sessions', 'started_at'),
        fetchAll<DecisionRow>('v_decisions', 'decision_id'),
        fetchAll<OpenResponseRow>('v_open_responses', 'response_id'),
        sb.from('news_items').select('id,item_key,headline,is_real,category,source_name,source_url,source_published_on,explanation,hint,validation_status,validation_notes,study_id').order('item_key'),
        sb.from('studies').select('id,code,version,title,status,config,changelog,description').order('version'),
      ])
      if (items.error) throw items.error
      if (studies.error) throw studies.error
      // Las sesiones de la 4.x («responsabilidad») tienen su propia pantalla y otras variables: no entran en los indicadores de 1.0.0–3.1.0
      const v4 = new Set((studies.data as StudyRow[]).filter((st) => st.config?.mode === 'responsabilidad').map((st) => st.version))
      const sessionCounts: Record<string, number> = {}
      for (const r of s.rows) if (!r.is_test) sessionCounts[r.instrument_version] = (sessionCounts[r.instrument_version] ?? 0) + 1
      const legacy = s.rows.filter((r) => !v4.has(r.instrument_version))
      const ids = new Set(legacy.map((r) => r.session_id))
      setData({ sessions: legacy, decisions: d.rows.filter((r) => ids.has(r.session_id)), openResponses: o.rows.filter((r) => ids.has(r.session_id)), items: items.data as NewsItemRow[], studies: studies.data as StudyRow[], sessionCounts, loadedAt: new Date() })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los datos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void reload() }, [reload])
  return { data, loading, error, reload, filters, setFilters, profile }
}
