// ---------------------------------------------------------------------------
// Versión 4.0.0 «responsabilidad antes de compartir»: indicadores por sesión y análisis
// Definiciones (docs/version-4.md):
//   R = noticias respondidas en la sesión (estados E1 a E6). E7 = tiempo agotado; E8 = interrumpida.
//   Principal: difusión sin verificación previa = (E1 + E2) / R, calculada por sesión y promediada entre sesiones.
//   Límites por tiempo agotado: inferior = (E1 + E2) / (R + E7); superior = (E1 + E2 + E7) / (R + E7).
// ---------------------------------------------------------------------------
import { chiSquareSf, mean, meanCI, ranks, sd, spearman, kruskalWallis, type TestResult } from './stats'
import type { Table } from './export'
import { normalizeCode } from '../lib/surveyCode'

export type ShareSessionRow = {
  session_id: string; instrument_version: string; status: string; is_test: boolean; exclusion_reason: string | null
  entry_origin: string | null; survey_intent: string | null; survey_code: string | null; survey_code_at: string | null
  device_class: string | null; started_at: string; completed_at: string | null; duration_seconds: number | null
  primera_vez: string | null; device_replay: boolean | null; items_total: number | null; cards_done: number; r_answered: number
  e1: number; e2: number; e3: number; e4: number; e5: number; e6: number; e7: number; e8: number
  verified_effective: number; evaluation_correct: number; belief_no_se: number; belief_correct: number; belief_decided: number
  real_si: number; real_answered: number; fake_si: number; fake_answered: number; score: number | null; is_valid: boolean
}

export type ShareDecisionRow = {
  decision_id: string; session_id: string; instrument_version: string; session_status: string; is_test: boolean; exclusion_reason: string | null
  entry_origin: string | null; survey_intent: string | null; survey_code: string | null; device_class: string | null; device_replay: boolean | null
  item_key: string; category: string; headline: string; is_real: boolean; position: number; image_shown: boolean
  first_action: string | null; first_action_ms: number | null; timed_out: boolean; timeout_stage: string | null; sources_opened: string[] | null
  source_kind: string | null; read_ms: number | null; evaluation: string | null; evaluation_correct: boolean | null; effective_verification: boolean
  final_action: string | null; belief: string | null; belief_correct: boolean | null; reason: string | null; state: string; points: number; created_at: string
}

const div = (k: number, n: number) => (n > 0 ? k / n : NaN)

/** Primera partida: la persona dijo que era su primera vez y el teléfono no tenía otra partida terminada. */
export const isFirstPlay = (s: ShareSessionRow) => (s.primera_vez ?? '').startsWith('Sí') && !s.device_replay

export type SessionIndicators = {
  session_id: string; R: number; e7: number
  dsv: number; dsvLo: number; dsvHi: number; noShare: number; verInit: number; verEff: number; shareTotal: number
  warning: number; evalCorrect: number; noSe: number; accuracy: number; discernment: number
}

/** Indicadores de una sesión. Las proporciones sin denominador quedan como NaN (no se imputan). */
export function sessionIndicators(s: ShareSessionRow): SessionIndicators {
  const R = s.r_answered
  const unv = s.e1 + s.e2
  const shared = s.e1 + s.e2 + s.e4 + s.e5
  const verified = s.e4 + s.e5 + s.e6
  return {
    session_id: s.session_id, R, e7: s.e7,
    dsv: div(unv, R),
    dsvLo: div(unv, R + s.e7),
    dsvHi: div(unv + s.e7, R + s.e7),
    noShare: div(s.e3, R),
    verInit: div(verified, R),
    verEff: div(s.verified_effective, R),
    shareTotal: div(shared, R),
    warning: div(s.e2 + s.e5, shared),
    evalCorrect: div(s.evaluation_correct, verified),
    noSe: div(s.belief_no_se, R),
    accuracy: div(s.belief_correct, s.belief_decided),
    discernment: div(s.real_si, s.real_answered) - div(s.fake_si, s.fake_answered),
  }
}

export type SampleRule = { firstOnly: boolean; includeTest: boolean }

/** Muestra de análisis: sesiones válidas (completas, sin exclusión, no de prueba) y, por defecto, solo primeras partidas. */
export function analysisSample(rows: ShareSessionRow[], rule: SampleRule) {
  const flow = { total: rows.length, test: 0, incomplete: 0, excluded: 0, replay: 0, allTimeout: 0, included: 0 }
  const included: ShareSessionRow[] = []
  for (const s of rows) {
    if (s.is_test && !rule.includeTest) { flow.test++; continue }
    if (s.exclusion_reason) { flow.excluded++; continue }
    if (s.status !== 'completed' || s.cards_done !== s.items_total) { flow.incomplete++; continue }
    if (rule.firstOnly && !isFirstPlay(s)) { flow.replay++; continue }
    if (s.r_answered === 0) { flow.allTimeout++; continue }
    included.push(s)
  }
  flow.included = included.length
  return { included, flow }
}

export type Estimate = { n: number; m: number; lo: number; hi: number; sd: number } | null
export function estimate(xs: number[]): Estimate {
  const v = xs.filter(Number.isFinite)
  const ci = meanCI(v)
  return ci ? { n: v.length, m: ci.m, lo: ci.lo, hi: ci.hi, sd: sd(v) } : v.length === 1 ? { n: 1, m: v[0], lo: NaN, hi: NaN, sd: NaN } : null
}

/** Estimación principal, límites por tiempo agotado y secundarios, todos como promedio entre sesiones. */
export function summarize(sample: ShareSessionRow[]) {
  const ind = sample.map(sessionIndicators)
  const col = (k: keyof SessionIndicators) => estimate(ind.map((i) => i[k] as number))
  return {
    n: sample.length,
    main: col('dsv'), lower: col('dsvLo'), upper: col('dsvHi'),
    noShare: col('noShare'), verInit: col('verInit'), verEff: col('verEff'), shareTotal: col('shareTotal'),
    warning: col('warning'), evalCorrect: col('evalCorrect'), noSe: col('noSe'), accuracy: col('accuracy'), discernment: col('discernment'),
    timeoutRate: estimate(sample.map((s) => div(s.e7, s.items_total ?? 0))),
    states: (['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7'] as const).map((k) => ({ state: k.toUpperCase(), n: sample.reduce((a, s) => a + s[k], 0) })),
    distribution: dsvDistribution(ind),
  }
}

function dsvDistribution(ind: SessionIndicators[]) {
  const bins = ['0–10%', '10–20%', '20–30%', '30–40%', '40–50%', '50–60%', '60–70%', '70–80%', '80–90%', '90–100%']
  const counts = bins.map(() => 0)
  for (const i of ind) if (Number.isFinite(i.dsv)) counts[Math.min(9, Math.floor(i.dsv * 10 + 1e-9))]++
  return bins.map((b, k) => ({ tramo: b, sesiones: counts[k] }))
}

/** Difusión sin verificar de una sesión restringida a un subconjunto de sus noticias (por tipo, por imagen…). */
export function dsvWithin(decisions: ShareDecisionRow[], pick: (d: ShareDecisionRow) => boolean): Map<string, number> {
  const acc = new Map<string, { k: number; r: number }>()
  for (const d of decisions) {
    if (!pick(d) || d.state === 'E7') continue
    const a = acc.get(d.session_id) ?? { k: 0, r: 0 }
    a.r++
    if (d.state === 'E1' || d.state === 'E2') a.k++
    acc.set(d.session_id, a)
  }
  return new Map([...acc].map(([id, a]) => [id, a.k / a.r]))
}

/** Prueba de rangos con signo de Wilcoxon (pareada), aproximación normal con corrección por empates; descarta diferencias 0. */
export function wilcoxonSigned(x: number[], y: number[]): TestResult & { medianDiff?: number; meanDiff?: number; r?: number } {
  const diffs = x.map((v, i) => v - y[i]).filter((d) => Number.isFinite(d))
  const nz = diffs.filter((d) => Math.abs(d) > 1e-12)
  const n = nz.length
  const method = 'Rangos con signo de Wilcoxon (pareada)'
  const meanDiff = mean(diffs)
  if (n < 10) return { method, n: diffs.length, assumptionsMet: false, meanDiff, notes: [`Solo ${n} pares con diferencia distinta de cero (< 10): no se calcula p.`] }
  const r = ranks(nz.map(Math.abs))
  const wPlus = nz.reduce((a, d, i) => a + (d > 0 ? r[i] : 0), 0)
  const mu = (n * (n + 1)) / 4
  const ties = new Map<number, number>()
  for (const v of r) ties.set(v, (ties.get(v) ?? 0) + 1)
  const tieAdj = [...ties.values()].reduce((a, t) => a + (t ** 3 - t), 0) / 48
  const sigma = Math.sqrt((n * (n + 1) * (2 * n + 1)) / 24 - tieAdj)
  const z = (wPlus - mu - Math.sign(wPlus - mu) * 0.5) / sigma
  const p = Math.min(1, chiSquareSf(z * z, 1))
  const effR = Math.abs(z) / Math.sqrt(n)
  return {
    method, n: diffs.length, statistic: wPlus, p, meanDiff, r: effR,
    effect: { name: 'r', value: effR, label: effR < 0.1 ? 'despreciable' : effR < 0.3 ? 'pequeño' : effR < 0.5 ? 'mediano' : 'grande' },
    assumptionsMet: true,
    notes: [`${diffs.length - n} pares sin diferencia se descartan. Diferencia media = ${(meanDiff * 100).toFixed(1).replace('.', ',')} puntos porcentuales.`],
  }
}

/** Corrección de Holm: devuelve los p ajustados en el mismo orden. */
export function holm(ps: number[]): number[] {
  const order = ps.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0])
  const out = new Array<number>(ps.length)
  let running = 0
  order.forEach(([p, i], k) => { running = Math.max(running, Math.min(1, (ps.length - k) * p)); out[i] = running })
  return out
}

/** Comparación pareada por sesión entre dos subconjuntos de noticias (p. ej., con y sin imagen). */
export function pairedComparison(decisions: ShareDecisionRow[], ids: Set<string>, a: (d: ShareDecisionRow) => boolean, b: (d: ShareDecisionRow) => boolean) {
  const ds = decisions.filter((d) => ids.has(d.session_id))
  const ma = dsvWithin(ds, a), mb = dsvWithin(ds, b)
  const both = [...ma.keys()].filter((k) => mb.has(k))
  const xa = both.map((k) => ma.get(k)!), xb = both.map((k) => mb.get(k)!)
  return { a: estimate(xa), b: estimate(xb), test: wilcoxonSigned(xa, xb) }
}

export type ItemRow = {
  item_key: string; headline: string; is_real: boolean; n: number; R: number
  E1: number; E2: number; E3: number; E4: number; E5: number; E6: number; E7: number
  dsv: number; verInit: number; verEff: number; warning: number; noSe: number; accuracy: number; withImage: number
}

/** Desglose por noticia (descriptivo; cada noticia aparece una vez por sesión). */
export function itemTable(decisions: ShareDecisionRow[], ids: Set<string>): ItemRow[] {
  const by = new Map<string, ShareDecisionRow[]>()
  for (const d of decisions) if (ids.has(d.session_id)) by.set(d.item_key, [...(by.get(d.item_key) ?? []), d])
  return [...by].map(([key, ds]) => {
    const c = (s: string) => ds.filter((d) => d.state === s).length
    const R = ds.length - c('E7')
    const shared = c('E1') + c('E2') + c('E4') + c('E5')
    const decided = ds.filter((d) => d.belief === 'si' || d.belief === 'no')
    return {
      item_key: key, headline: ds[0].headline, is_real: ds[0].is_real, n: ds.length, R,
      E1: c('E1'), E2: c('E2'), E3: c('E3'), E4: c('E4'), E5: c('E5'), E6: c('E6'), E7: c('E7'),
      dsv: div(c('E1') + c('E2'), R), verInit: div(c('E4') + c('E5') + c('E6'), R), verEff: div(ds.filter((d) => d.effective_verification).length, R),
      warning: div(c('E2') + c('E5'), shared), noSe: div(ds.filter((d) => d.belief === 'no_se').length, R),
      accuracy: div(decided.filter((d) => d.belief_correct).length, decided.length), withImage: div(ds.filter((d) => d.image_shown).length, ds.length),
    }
  }).sort((a, b) => Number(b.is_real) - Number(a.is_real) || a.item_key.localeCompare(b.item_key))
}

/** Difusión sin verificar por posición en la partida (1 a 10): ¿cambia a lo largo del juego? */
export function byPosition(decisions: ShareDecisionRow[], ids: Set<string>) {
  const out: { posicion: number; dsv: number; n: number }[] = []
  for (let p = 1; p <= 10; p++) {
    const ds = decisions.filter((d) => ids.has(d.session_id) && d.position === p && d.state !== 'E7')
    out.push({ posicion: p, dsv: div(ds.filter((d) => d.state === 'E1' || d.state === 'E2').length, ds.length), n: ds.length })
  }
  return out
}

// ---------------------------------------------------------------------------
// Encuesta (Google Forms): unión por código seudónimo, solo en el navegador
// ---------------------------------------------------------------------------

/** CSV de Google Forms (separador «,» o «;», comillas dobles). */
export function parseCSV(text: string): string[][] {
  const t = text.replace(/^﻿/, '')
  const firstLine = t.split(/\r?\n/, 1)[0] ?? ''
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = [], cell = '', q = false
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (q) {
      if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++ } else q = false }
      else cell += ch
    } else if (ch === '"') q = true
    else if (ch === sep) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}


export type SurveyJoin = {
  header: string[]; rows: string[][]; codeCol: number
  matched: { session: ShareSessionRow; row: string[] }[]
  unmatchedRows: number; noCodeRows: number; duplicateCodes: number
}

/** Une las respuestas de la encuesta con las sesiones por código. Si un código aparece en varias sesiones, se usa la primera completa. */
export function joinSurvey(table: string[][], codeCol: number, sessions: ShareSessionRow[]): SurveyJoin {
  const [header, ...rows] = table
  const byCode = new Map<string, ShareSessionRow>()
  for (const s of [...sessions].sort((a, b) => a.started_at.localeCompare(b.started_at))) if (s.survey_code && !byCode.has(s.survey_code)) byCode.set(s.survey_code, s)
  const seen = new Set<string>()
  const matched: SurveyJoin['matched'] = []
  let unmatched = 0, noCode = 0, dup = 0
  for (const r of rows) {
    const c = normalizeCode(r[codeCol] ?? '')
    if (!c) { noCode++; continue }
    if (seen.has(c)) { dup++; continue }
    seen.add(c)
    const s = byCode.get(c)
    if (s) matched.push({ session: s, row: r }); else unmatched++
  }
  return { header, rows, codeCol, matched, unmatchedRows: unmatched, noCodeRows: noCode, duplicateCodes: dup }
}

/** Niveles de una pregunta en el orden en que aparecen (o numéricos ascendentes si todos son números). */
export function levelsOf(values: string[]): string[] {
  const u = [...new Set(values.map((v) => v.trim()).filter(Boolean))]
  return u.every((v) => Number.isFinite(Number(v.replace(',', '.')))) ? u.sort((a, b) => Number(a.replace(',', '.')) - Number(b.replace(',', '.'))) : u
}

/** Hábito declarado (ordinal) frente a un indicador del juego: Spearman con el orden dado y Kruskal–Wallis por nivel. */
export function habitVsBehavior(pairs: { level: string; value: number }[], order: string[]) {
  const ok = pairs.filter((p) => order.includes(p.level) && Number.isFinite(p.value))
  const groups: Record<string, number[]> = {}
  for (const l of order) groups[l] = ok.filter((p) => p.level === l).map((p) => p.value)
  return {
    perLevel: order.map((l) => ({ level: l, n: groups[l].length, m: groups[l].length ? mean(groups[l]) : NaN })),
    spearman: spearman(ok.map((p) => order.indexOf(p.level)), ok.map((p) => p.value)),
    kruskal: kruskalWallis(groups),
  }
}

// ---------------------------------------------------------------------------
// Exportación
// ---------------------------------------------------------------------------
const r4 = (x: number) => (Number.isFinite(x) ? Math.round(x * 10000) / 10000 : null)

export function v4SessionsTable(rows: ShareSessionRow[]): Table {
  const cols = ['session_id', 'version', 'estado', 'valida', 'prueba', 'exclusion', 'primera_vez', 'otra_partida_en_dispositivo', 'origen', 'encuesta_momento', 'codigo_encuesta', 'dispositivo', 'inicio_utc', 'fin_utc', 'duracion_s',
    'R', 'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'difusion_sin_verificar', 'limite_inferior_E7', 'limite_superior_E7', 'no_difusion_sin_verificar', 'verificacion_iniciada', 'verificacion_efectiva', 'difusion_total',
    'uso_aviso', 'evaluacion_correcta', 'no_se', 'precision_creencia', 'discernimiento', 'puntos']
  return {
    name: 'participantes_v4', columns: cols,
    rows: rows.map((s) => {
      const i = sessionIndicators(s)
      return [s.session_id, s.instrument_version, s.status, s.is_valid, s.is_test, s.exclusion_reason, s.primera_vez, s.device_replay, s.entry_origin, s.survey_intent, s.survey_code, s.device_class, s.started_at, s.completed_at, s.duration_seconds,
        s.r_answered, s.e1, s.e2, s.e3, s.e4, s.e5, s.e6, s.e7, s.e8, r4(i.dsv), r4(i.dsvLo), r4(i.dsvHi), r4(i.noShare), r4(i.verInit), r4(i.verEff), r4(i.shareTotal),
        r4(i.warning), r4(i.evalCorrect), r4(i.noSe), r4(i.accuracy), r4(i.discernment), s.score]
    }),
  }
}

export function v4DecisionsTable(rows: ShareDecisionRow[]): Table {
  const cols = ['session_id', 'version', 'codigo_encuesta', 'noticia', 'es_real', 'posicion', 'con_imagen', 'estado', 'primera_accion', 'ms_primera_accion', 'tiempo_agotado', 'etapa_tiempo_agotado',
    'fuentes_abiertas', 'fuente_leida', 'ms_lectura', 'evaluacion', 'evaluacion_correcta', 'verificacion_efectiva', 'accion_final', 'creencia', 'creencia_correcta', 'motivo', 'puntos', 'registrada_utc']
  return {
    name: 'decisiones_v4', columns: cols,
    rows: rows.map((d) => [d.session_id, d.instrument_version, d.survey_code, d.item_key, d.is_real, d.position, d.image_shown, d.state, d.first_action, d.first_action_ms, d.timed_out, d.timeout_stage,
      (d.sources_opened ?? []).join('|'), d.source_kind, d.read_ms, d.evaluation, d.evaluation_correct, d.effective_verification, d.final_action, d.belief, d.belief_correct, d.reason, d.points, d.created_at]),
  }
}

export function v4DictionaryTable(): Table {
  const d: [string, string][] = [
    ['R', 'Noticias respondidas (estados E1 a E6).'],
    ['E1', 'Reenvió sin verificar.'], ['E2', 'Reenvió con aviso sin verificar.'], ['E3', 'No reenvió, sin verificar.'],
    ['E4', 'Verificó y reenvió.'], ['E5', 'Verificó y reenvió con aviso.'], ['E6', 'Verificó y no reenvió.'],
    ['E7', 'Tiempo agotado (al decidir o durante la verificación). No es una decisión.'], ['E8', 'Noticias no alcanzadas en una sesión interrumpida.'],
    ['difusion_sin_verificar', 'Indicador principal: (E1 + E2) / R.'],
    ['limite_inferior_E7', '(E1 + E2) / (R + E7): todo E7 como «no reenvió».'], ['limite_superior_E7', '(E1 + E2 + E7) / (R + E7): todo E7 como «reenvió sin verificar».'],
    ['no_difusion_sin_verificar', 'E3 / R.'], ['verificacion_iniciada', '(E4 + E5 + E6) / R: eligió «Verificar primero» (consulta).'],
    ['verificacion_efectiva', 'Verificaciones con fuente oficial o medio, al menos 2 s de lectura medida por el servidor y evaluación igual a lo que dice la fuente, sobre R.'],
    ['difusion_total', '(E1 + E2 + E4 + E5) / R.'], ['uso_aviso', '(E2 + E5) / (E1 + E2 + E4 + E5).'],
    ['evaluacion_correcta', 'Evaluaciones de la fuente correctas / verificaciones iniciadas.'], ['no_se', 'Respuestas «No sé» / R.'],
    ['precision_creencia', 'Creencias correctas / respuestas Sí o No.'], ['discernimiento', 'P(Sí | real) − P(Sí | falsa) con la creencia declarada.'],
    ['creencia', 'Declarada DESPUÉS de decidir: puede ajustarse para justificar la decisión.'],
    ['codigo_encuesta', 'Código seudónimo voluntario para unir con la encuesta. No identifica a la persona.'],
    ['primera_vez', 'Respuesta a «¿Es la primera vez que juegas este juego?». El análisis principal usa solo primeras partidas.'],
    ['otra_partida_en_dispositivo', 'El navegador ya había terminado otra partida de la 4.0.0.'],
  ]
  return { name: 'diccionario_v4', columns: ['variable', 'definicion'], rows: d }
}
