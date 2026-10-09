import type { DecisionRow, SessionRow } from './types'
import { POST, VERIFICA } from './types'
import { mean, median, sd, wilson } from './stats'

// ---------------------------------------------------------------------------
// Filtros combinables
// ---------------------------------------------------------------------------
export type Filters = {
  from?: string            // YYYY-MM-DD (inclusive, fecha de inicio de sesión, UTC)
  to?: string              // YYYY-MM-DD (inclusive)
  versions: string[]       // vacío = todas
  statuses: SessionRow['status_effective'][] // vacío = todas excepto 'prueba'
  verifica: string[]       // respuesta inicial
  categories: string[]     // categoría de noticia (filtra decisiones)
  hint: 'all' | 'with' | 'without'          // decisiones con/sin lupa
  outcome: 'all' | 'correct' | 'error' | 'timeout' // resultado de clasificación
  includeTest: boolean
}
export const DEFAULT_FILTERS: Filters = { versions: [], statuses: [], verifica: [], categories: [], hint: 'all', outcome: 'all', includeTest: false }

export function describeFilters(f: Filters): string {
  const p: string[] = []
  if (f.from || f.to) p.push(`fecha ${f.from ?? '…'} a ${f.to ?? '…'}`)
  if (f.versions.length) p.push(`versión ${f.versions.join('/')}`)
  p.push(f.statuses.length ? `estado ${f.statuses.join('/')}` : 'todos los estados salvo prueba')
  if (f.verifica.length) p.push(`verifica=${f.verifica.join('/')}`)
  if (f.categories.length) p.push(`categoría=${f.categories.join('/')}`)
  if (f.hint !== 'all') p.push(f.hint === 'with' ? 'decisiones con lupa' : 'decisiones sin lupa')
  if (f.outcome !== 'all') p.push(`resultado=${f.outcome}`)
  if (f.includeTest) p.push('incluye datos de prueba')
  return p.join('; ')
}

export function filterSessions(rows: SessionRow[], f: Filters): SessionRow[] {
  return rows.filter((s) => {
    if (!f.includeTest && s.is_test) return false
    const d = s.started_at.slice(0, 10)
    if (f.from && d < f.from) return false
    if (f.to && d > f.to) return false
    if (f.versions.length && !f.versions.includes(s.instrument_version)) return false
    if (f.statuses.length && !f.statuses.includes(s.status_effective)) return false
    if (f.verifica.length && !f.verifica.includes(s.verifica ?? '')) return false
    return true
  })
}

/** Decisiones de las sesiones filtradas + filtros a nivel de decisión. */
export function filterDecisions(rows: DecisionRow[], sessions: SessionRow[], f: Filters): DecisionRow[] {
  const ids = new Set(sessions.map((s) => s.session_id))
  return rows.filter((d) => {
    if (!ids.has(d.session_id)) return false
    if (f.categories.length && !f.categories.includes(d.category)) return false
    if (f.hint === 'with' && !d.hint_used) return false
    if (f.hint === 'without' && d.hint_used) return false
    if (f.outcome === 'correct' && !d.is_correct) return false
    if (f.outcome === 'error' && (d.is_correct || d.timed_out)) return false
    if (f.outcome === 'timeout' && !d.timed_out) return false
    return true
  })
}

// ---------------------------------------------------------------------------
// Indicadores principales (definiciones en docs/diccionario-de-datos.md §Indicadores)
// ---------------------------------------------------------------------------
export type Kpis = ReturnType<typeof computeKpis>

export function computeKpis(sessions: SessionRow[], decisions: DecisionRow[]) {
  const started = sessions.filter((s) => s.status_effective !== 'prueba')
  const completed = started.filter((s) => s.status === 'completed')
  const valid = started.filter((s) => s.is_valid)
  const incomplete = started.filter((s) => s.status !== 'completed')
  const tests = sessions.filter((s) => s.is_test)
  const validIds = new Set(valid.map((s) => s.session_id))
  const dv = decisions.filter((d) => validIds.has(d.session_id))

  const correct = valid.map((s) => s.correct_count ?? 0)
  const fakeD = dv.filter((d) => d.correct_classification === 'falsa')
  const realD = dv.filter((d) => d.correct_classification === 'real')
  const durations = valid.map((s) => s.duration_seconds).filter((x): x is number => x !== null)
  const postAnswered = valid.filter((s) => s.post_cambio !== null)
  const verifyMore = postAnswered.filter((s) => s.post_cambio === POST[0])
  const withHint = valid.filter((s) => (s.hints_used ?? 0) > 0)

  return {
    started: started.length,
    completed: completed.length,
    valid: valid.length,
    incomplete: incomplete.length,
    excluded: started.filter((s) => s.status_effective === 'excluida').length,
    tests: tests.length,
    completionRate: ratio(completed.length, started.length),
    meanCorrect: mean(correct),
    medianCorrect: median(correct),
    sdCorrect: sd(correct),
    decisions: dv.length,
    accuracy: ratio(dv.filter((d) => d.is_correct).length, dv.length),
    accuracyCI: wilson(dv.filter((d) => d.is_correct).length, dv.length),
    fakeAcceptance: ratio(fakeD.filter((d) => d.choice === 'real').length, fakeD.length),
    fakeDecisions: fakeD.length,
    realRejection: ratio(realD.filter((d) => d.choice === 'falsa').length, realD.length),
    realDecisions: realD.length,
    timeoutRate: ratio(dv.filter((d) => d.timed_out).length, dv.length),
    sessionsWithHint: ratio(withHint.length, valid.length),
    hintsPerDecision: ratio(dv.filter((d) => d.hint_used).length, dv.length),
    medianDuration: median(durations),
    verifyMoreRate: ratio(verifyMore.length, postAnswered.length),
    verifyMoreN: postAnswered.length,
  }
}

export const ratio = (k: number, n: number) => (n > 0 ? k / n : NaN)

// ---------------------------------------------------------------------------
// Series para gráficos
// ---------------------------------------------------------------------------
export function sessionsByDate(sessions: SessionRow[]) {
  const m = new Map<string, { date: string; iniciadas: number; completadas: number; validas: number }>()
  for (const s of sessions) {
    if (s.status_effective === 'prueba') continue
    const d = s.started_at.slice(0, 10)
    const r = m.get(d) ?? { date: d, iniciadas: 0, completadas: 0, validas: 0 }
    r.iniciadas++
    if (s.status === 'completed') r.completadas++
    if (s.is_valid) r.validas++
    m.set(d, r)
  }
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function scoreDistribution(sessions: SessionRow[]) {
  const out = Array.from({ length: 11 }, (_, k) => ({ aciertos: k, sesiones: 0 }))
  for (const s of sessions) if (s.is_valid && s.correct_count !== null) out[s.correct_count].sesiones++
  return out
}

export type ItemStat = {
  item_key: string; headline: string; category: string; correct_classification: 'real' | 'falsa'; validation_status: string
  n: number; correct: number; errors: number; timeouts: number; hints: number
  accuracy: number; errorRate: number; hintRate: number
  medianMs: number; meanMs: number
  accepted: number   // clasificada como real
}
export function itemStats(decisions: DecisionRow[]): ItemStat[] {
  const m = new Map<string, DecisionRow[]>()
  for (const d of decisions) m.set(d.item_key, [...(m.get(d.item_key) ?? []), d])
  return [...m.entries()].map(([k, ds]) => {
    const ms = ds.filter((d) => !d.timed_out && d.response_ms !== null).map((d) => d.response_ms as number)
    const correct = ds.filter((d) => d.is_correct).length
    const timeouts = ds.filter((d) => d.timed_out).length
    return {
      item_key: k, headline: ds[0].headline, category: ds[0].category, correct_classification: ds[0].correct_classification,
      validation_status: ds[0].validation_status,
      n: ds.length, correct, errors: ds.length - correct - timeouts, timeouts,
      hints: ds.filter((d) => d.hint_used).length,
      accuracy: ratio(correct, ds.length), errorRate: ratio(ds.length - correct, ds.length), hintRate: ratio(ds.filter((d) => d.hint_used).length, ds.length),
      medianMs: median(ms), meanMs: mean(ms),
      accepted: ds.filter((d) => d.choice === 'real').length,
    }
  }).sort((a, b) => a.accuracy - b.accuracy)
}

/** Comportamiento declarado (¿verificas?) vs observado (aciertos y uso de lupa), solo sesiones válidas. */
export function declaredVsObserved(sessions: SessionRow[]) {
  return VERIFICA.map((v) => {
    const g = sessions.filter((s) => s.is_valid && s.verifica === v)
    const c = g.map((s) => s.correct_count ?? 0)
    return {
      grupo: v, n: g.length,
      aciertos_promedio: mean(c),
      pct_uso_lupa: ratio(g.filter((s) => (s.hints_used ?? 0) > 0).length, g.length),
      pct_acepta_falsas: ratio(g.reduce((a, s) => a + (s.fake_accepted_count ?? 0), 0), g.reduce((a, s) => a + (s.fake_total ?? 0), 0)),
    }
  })
}

export function distribution(sessions: SessionRow[], key: keyof SessionRow, levels: readonly string[]) {
  const answered = sessions.filter((s) => s[key] !== null)
  return levels.map((l) => {
    const k = answered.filter((s) => s[key] === l).length
    return { opcion: l, n: k, pct: ratio(k, answered.length) }
  })
}
