import { describe, expect, it } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { chiSquareSf, crosstab, fisher2x2, independenceTest, kruskalWallis, mean, meanCI, median, sd, spearman, tCritical, wilson } from './stats'
import { computeKpis, filterDecisions, filterSessions, DEFAULT_FILTERS, itemStats } from './metrics'
import { toCSV, toXLSX } from './export'
import type { DecisionRow, SessionRow } from './types'

describe('estadística', () => {
  it('descriptivos', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5)
    expect(median([5, 1, 3])).toBe(3)
    expect(sd([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3)
  })
  it('distribuciones de referencia', () => {
    expect(chiSquareSf(3.841459, 1)).toBeCloseTo(0.05, 4)
    expect(chiSquareSf(5.991465, 2)).toBeCloseTo(0.05, 4)
    expect(tCritical(0.05, 10)).toBeCloseTo(2.228, 3)
    expect(tCritical(0.05, 30)).toBeCloseTo(2.042, 3)
  })
  it('Wilson y t', () => {
    const w = wilson(5, 10)!
    expect(w.lo).toBeCloseTo(0.2366, 3)
    expect(w.hi).toBeCloseTo(0.7634, 3)
    const ci = meanCI([1, 2, 3, 4, 5])!
    expect(ci.lo).toBeCloseTo(1.0368, 3)
    expect(ci.hi).toBeCloseTo(4.9632, 3)
  })
  it('Fisher exacto (té de Fisher: p = 0,4857)', () => {
    expect(fisher2x2(3, 1, 1, 3)).toBeCloseTo(0.4857, 4)
    expect(fisher2x2(10, 0, 0, 10)).toBeCloseTo(1.0825e-5, 8)
  })
  it('chi-cuadrado solo si se cumplen supuestos', () => {
    const big = { rows: ['a', 'b'], cols: ['x', 'y'], counts: [[30, 20], [15, 35]] }
    const r = independenceTest(big)
    expect(r.method).toMatch(/Chi-cuadrado de independencia/)
    expect(r.statistic).toBeCloseTo(9.0909, 3)
    expect(r.p).toBeCloseTo(0.002569, 5)
    const small = { rows: ['a', 'b', 'c'], cols: ['x', 'y'], counts: [[1, 2], [0, 3], [2, 1]] }
    expect(independenceTest(small).assumptionsMet).toBe(false)
    expect(independenceTest(small).p).toBeUndefined()
    const s2 = { rows: ['a', 'b'], cols: ['x', 'y'], counts: [[3, 1], [1, 3]] }
    expect(independenceTest(s2).method).toMatch(/Fisher/)
  })
  it('Spearman y Kruskal–Wallis', () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    expect(spearman(x, x.map((v) => v * v)).statistic).toBeCloseTo(1, 10)
    expect(spearman([1, 2, 3], [1, 2, 3]).assumptionsMet).toBe(false)
    // Ejemplo clásico: H = 7,98 aprox. con 3 grupos
    const kw = kruskalWallis({ a: [2.9, 3.0, 2.5, 2.6, 3.2], b: [3.8, 2.7, 4.0, 2.4, 3.9], c: [2.8, 3.4, 3.7, 2.2, 2.0] })
    expect(kw.assumptionsMet).toBe(true)
    expect(kw.df).toBe(2)
    expect(kruskalWallis({ a: [1, 2], b: [3, 4, 5, 6, 7] }).assumptionsMet).toBe(false)
  })
  it('crosstab con niveles fijos', () => {
    const t = crosstab([{ a: 'x', b: 'p' }, { a: 'x', b: 'q' }, { a: 'y', b: 'q' }], (d) => d.a, (d) => d.b, ['x', 'y'], ['p', 'q'])
    expect(t.counts).toEqual([[1, 1], [0, 1]])
  })
})

const S = (o: Partial<SessionRow>): SessionRow => ({
  session_id: crypto.randomUUID(), study_code: 'lo-reenviarias', instrument_version: '2.0.0', origin: 'app', status: 'completed', is_test: false, exclusion_reason: null,
  is_valid: true, status_effective: 'completada', started_at: '2026-10-01T10:00:00Z', completed_at: '2026-10-01T10:03:00Z', duration_seconds: 180, device_class: 'mobile',
  reduced_motion: false, consent_accepted: true, opinion: 'x', verifica: 'Siempre', compartio_falso: 'No', responsable: 'Quien la crea', post_cambio: 'Tal vez',
  decisions_count: 10, correct_count: 7, error_count: 3, timeout_count: 0, score: 1000, hints_used: 0, fake_total: 5, fake_accepted_count: 2, real_total: 5, real_rejected_count: 1, simulated_reach_total: 0, ...o,
})
const D = (session_id: string, o: Partial<DecisionRow>): DecisionRow => ({
  decision_id: Math.floor(Math.random() * 1e9), session_id, instrument_version: '2.0.0', origin: 'app', session_status: 'completed', is_test: false, exclusion_reason: null,
  item_key: 'f_x', category: 'Salud', headline: 'h', validation_status: 'verificada', position: 1, choice: 'real', correct_classification: 'falsa', is_correct: false,
  timed_out: false, hint_used: false, response_ms: 3000, points_awarded: 0, streak_after: 0, simulated_reach: 1000, created_at: '2026-10-01T10:01:00Z', ...o,
})

describe('indicadores', () => {
  it('denominadores: válidas, falsas aceptadas, tiempo agotado y datos de prueba', () => {
    const a = S({ post_cambio: 'Sí, verificaría más', hints_used: 1 }), b = S({ correct_count: 3 })
    const inc = S({ status: 'started', status_effective: 'en_curso', is_valid: false, correct_count: null })
    const test = S({ is_test: true, status_effective: 'prueba', is_valid: false })
    const decisions = [
      D(a.session_id, { choice: 'real', correct_classification: 'falsa', is_correct: false }),
      D(a.session_id, { choice: 'falsa', correct_classification: 'falsa', is_correct: true }),
      D(b.session_id, { choice: null, timed_out: true, correct_classification: 'falsa', is_correct: false }),
      D(b.session_id, { choice: 'falsa', correct_classification: 'real', is_correct: false, item_key: 'r_y' }),
      D(inc.session_id, { choice: 'real', correct_classification: 'real', is_correct: true }),
    ]
    const sessions = filterSessions([a, b, inc, test], DEFAULT_FILTERS)
    expect(sessions).toHaveLength(3) // prueba excluida por defecto
    const k = computeKpis(sessions, filterDecisions(decisions, sessions, DEFAULT_FILTERS))
    expect(k.started).toBe(3)
    expect(k.completed).toBe(2)
    expect(k.valid).toBe(2)
    expect(k.completionRate).toBeCloseTo(2 / 3)
    expect(k.meanCorrect).toBe(5)
    expect(k.decisions).toBe(4) // la sesión incompleta no entra
    expect(k.accuracy).toBe(0.25)
    expect(k.fakeAcceptance).toBeCloseTo(1 / 3) // 1 de 3 decisiones sobre falsas (incluye tiempo agotado)
    expect(k.realRejection).toBe(1)
    expect(k.verifyMoreRate).toBe(0.5)
    expect(k.sessionsWithHint).toBe(0.5)
    expect(itemStats(decisions).find((i) => i.item_key === 'f_x')!.timeouts).toBe(1)
  })
  it('filtros combinables', () => {
    const a = S({ started_at: '2026-09-01T00:00:00Z', instrument_version: '1.0.0' }), b = S({ verifica: 'A veces' })
    expect(filterSessions([a, b], { ...DEFAULT_FILTERS, from: '2026-09-15' })).toEqual([b])
    expect(filterSessions([a, b], { ...DEFAULT_FILTERS, versions: ['1.0.0'] })).toEqual([a])
    expect(filterSessions([a, b], { ...DEFAULT_FILTERS, verifica: ['A veces'] })).toEqual([b])
    const ds = [D(a.session_id, { hint_used: true }), D(b.session_id, { category: 'Educación' })]
    expect(filterDecisions(ds, [a, b], { ...DEFAULT_FILTERS, hint: 'with' })).toHaveLength(1)
    expect(filterDecisions(ds, [a, b], { ...DEFAULT_FILTERS, categories: ['Educación'] })).toHaveLength(1)
  })
})

describe('exportación', () => {
  it('CSV con BOM, «;», coma decimal y protección contra fórmulas', () => {
    const csv = toCSV({ name: 't', columns: ['a', 'b'], rows: [[1.5, '=HYPERLINK("x")'], [null, 'texto "citado"']] })
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toContain('"1,5";"\'=HYPERLINK(""x"")"')
    expect(csv).toContain(';"texto ""citado"""')
  })
  it('XLSX válido con varias hojas', () => {
    const z = unzipSync(toXLSX([{ name: 'uno', columns: ['x'], rows: [[1], ['<b>']] }, { name: 'dos', columns: ['y'], rows: [] }]))
    expect(Object.keys(z)).toContain('xl/worksheets/sheet2.xml')
    const s1 = strFromU8(z['xl/worksheets/sheet1.xml'])
    expect(s1).toContain('&lt;b&gt;')
    expect(strFromU8(z['xl/workbook.xml'])).toContain('name="dos"')
  })
})
