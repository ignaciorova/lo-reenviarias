import { describe, expect, it } from 'vitest'
import { analysisSample, holm, itemTable, pairedComparison, sessionIndicators, summarize, wilcoxonSigned, type ShareDecisionRow, type ShareSessionRow } from './v4'

const base: ShareSessionRow = {
  session_id: 's', instrument_version: '4.0.0', status: 'completed', is_test: false, exclusion_reason: null, entry_origin: null, survey_intent: null, survey_code: null, survey_code_at: null,
  device_class: 'mobile', started_at: '2026-10-11T10:00:00Z', completed_at: '2026-10-11T10:05:00Z', duration_seconds: 300, primera_vez: 'Sí, es la primera vez', device_replay: false,
  items_total: 10, cards_done: 10, r_answered: 0, e1: 0, e2: 0, e3: 0, e4: 0, e5: 0, e6: 0, e7: 0, e8: 0, verified_effective: 0, evaluation_correct: 0, belief_no_se: 0,
  belief_correct: 0, belief_decided: 0, real_si: 0, real_answered: 0, fake_si: 0, fake_answered: 0, score: 600, is_valid: true,
}
const sess = (id: string, c: Partial<ShareSessionRow>): ShareSessionRow => {
  const s = { ...base, session_id: id, ...c }
  s.r_answered = s.e1 + s.e2 + s.e3 + s.e4 + s.e5 + s.e6
  return s
}

describe('indicadores 4.0.0', () => {
  // La misma sesión que arma la prueba SQL 40: E1 E2 E3×2 E4 E5 E6 E7×3
  const s = sess('a', { e1: 1, e2: 1, e3: 2, e4: 1, e5: 1, e6: 1, e7: 3, verified_effective: 2, evaluation_correct: 2, belief_no_se: 2, belief_correct: 3, belief_decided: 5, real_si: 2, real_answered: 3, fake_si: 1, fake_answered: 4 })
  it('principal, límites y secundarios', () => {
    const i = sessionIndicators(s)
    expect(i.R).toBe(7)
    expect(i.dsv).toBeCloseTo(2 / 7)
    expect(i.dsvLo).toBeCloseTo(2 / 10)
    expect(i.dsvHi).toBeCloseTo(5 / 10)
    expect(i.noShare + i.verInit + i.dsv).toBeCloseTo(1)
    expect(i.verEff).toBeCloseTo(2 / 7)
    expect(i.warning).toBeCloseTo(2 / 4)
    expect(i.evalCorrect).toBeCloseTo(2 / 3)
    expect(i.accuracy).toBeCloseTo(3 / 5)
    expect(i.discernment).toBeCloseTo(2 / 3 - 1 / 4)
  })
  it('sin denominador no se imputa', () => {
    const i = sessionIndicators(sess('b', { e3: 10 }))
    expect(i.dsv).toBe(0)
    expect(Number.isNaN(i.warning)).toBe(true)
    expect(Number.isNaN(i.evalCorrect)).toBe(true)
  })
  it('muestra: solo primeras partidas completas, sin pruebas; todo agotado aparte', () => {
    const rows = [
      sess('ok', { e1: 5, e3: 5 }),
      sess('test', { e1: 5, e3: 5, is_test: true }),
      sess('rep', { e1: 5, e3: 5, primera_vez: 'No, ya había jugado' }),
      sess('dev', { e1: 5, e3: 5, device_replay: true }),
      sess('inc', { e1: 2, status: 'started', cards_done: 2 }),
      sess('exc', { e1: 5, e3: 5, exclusion_reason: 'falla técnica' }),
      sess('to', { e7: 10 }),
      sess('bot', { e1: 10, automation_signals: ['decisiones_rapidas'], automation_flagged: true }),
      sess('rafaga', { e1: 5, e3: 5, automation_signals: ['rafaga'], automation_flagged: false }),
      sess('revisada', { e1: 5, e3: 5, automation_signals: ['partida_rapida'], automation_review: 'humana', automation_flagged: false }),
    ]
    const { included, flow } = analysisSample(rows, { firstOnly: true, includeTest: false })
    expect(included.map((s) => s.session_id)).toEqual(['ok', 'rafaga', 'revisada'])
    expect(flow).toEqual({ total: 10, test: 1, incomplete: 1, excluded: 1, automated: 1, replay: 2, allTimeout: 1, included: 3 })
    expect(analysisSample(rows, { firstOnly: false, includeTest: false }).included).toHaveLength(5)
  })
  it('promedio entre sesiones (cada persona pesa igual) con IC', () => {
    const rows = [sess('a', { e1: 10 }), sess('b', { e3: 10 }), sess('c', { e1: 5, e3: 5 }), sess('d', { e1: 1, e3: 9 })]
    const m = summarize(rows)
    expect(m.main!.m).toBeCloseTo((1 + 0 + 0.5 + 0.1) / 4)
    expect(m.main!.lo).toBeLessThan(m.main!.m)
    expect(m.distribution.find((b) => b.tramo === '90–100%')!.sesiones).toBe(1)
    expect(m.states.find((x) => x.state === 'E1')!.n).toBe(16)
  })
})

describe('pruebas', () => {
  it('Holm', () => {
    const a = holm([0.01, 0.04, 0.03])
    expect(a[0]).toBeCloseTo(0.03)
    expect(a[2]).toBeCloseTo(0.06)
    expect(a[1]).toBeCloseTo(0.06)
  })
  it('Wilcoxon pareada: igual a scipy.stats.wilcoxon(method="approx", correction=True) → p = 0,008590', () => {
    const x = [1.83, 0.5, 1.62, 2.48, 1.68, 1.88, 1.55, 3.06, 1.3, 2.1, 1.9, 2.2]
    const y = [0.878, 0.647, 0.598, 2.05, 1.06, 1.29, 1.06, 3.14, 1.29, 1.5, 1.2, 1.0]
    const r = wilcoxonSigned(x, y)
    expect(r.assumptionsMet).toBe(true)
    expect(r.statistic).toBe(73)
    expect(r.p).toBeCloseTo(0.0085900, 6)
    expect(wilcoxonSigned([1, 2], [0, 0]).assumptionsMet).toBe(false)
  })
})

const dec = (sid: string, key: string, pos: number, state: string, c: Partial<ShareDecisionRow> = {}): ShareDecisionRow => ({
  decision_id: `${sid}-${pos}`, session_id: sid, instrument_version: '4.0.0', session_status: 'completed', is_test: false, exclusion_reason: null, entry_origin: null, survey_intent: null,
  survey_code: null, device_class: null, device_replay: false, item_key: key, category: 'x', headline: key, is_real: key.startsWith('r_'), position: pos, image_shown: pos % 2 === 0,
  first_action: null, first_action_ms: 1000, timed_out: state === 'E7', timeout_stage: null, sources_opened: [], source_kind: null, read_ms: null, evaluation: null, evaluation_correct: null,
  effective_verification: false, final_action: null, belief: 'si', belief_correct: key.startsWith('r_'), reason: null, state, points: 0, created_at: '2026-10-11T10:00:00Z', ...c,
})

describe('por noticia y comparación pareada', () => {
  it('tabla por noticia', () => {
    const ds = [dec('a', 'r_x', 1, 'E1'), dec('b', 'r_x', 1, 'E4', { effective_verification: true }), dec('c', 'r_x', 1, 'E7', { belief: null })]
    const [row] = itemTable(ds, new Set(['a', 'b', 'c']))
    expect(row).toMatchObject({ n: 3, R: 2, E1: 1, E4: 1, E7: 1, dsv: 0.5, verInit: 0.5, verEff: 0.5 })
  })
  it('imagen sí/no, por sesión', () => {
    const ds: ShareDecisionRow[] = []
    const ids = new Set<string>()
    for (let s = 0; s < 14; s++) {
      ids.add(`s${s}`)
      for (let p = 1; p <= 10; p++) ds.push(dec(`s${s}`, `k${p}`, p, p % 2 === 0 ? (p / 2 <= 1 + (s % 5) ? 'E1' : 'E3') : (p === 1 ? 'E1' : 'E3')))
    }
    const c = pairedComparison(ds, ids, (d) => d.image_shown, (d) => !d.image_shown)
    expect(c.a!.n).toBe(14)
    expect(c.b!.m).toBeCloseTo(0.2)
    expect(c.a!.m).toBeGreaterThan(c.b!.m)
    expect(c.test.assumptionsMet).toBe(true)
    expect(c.test.p!).toBeLessThan(0.01)
  })
})
