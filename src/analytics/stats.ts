// Estadística descriptiva e inferencial sin dependencias externas.
// Cada prueba devuelve si sus supuestos se cumplen; la interfaz no muestra p-valores cuando no.

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
export const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : NaN)

export function quantile(xs: number[], q: number): number {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const pos = (s.length - 1) * q
  const lo = Math.floor(pos), hi = Math.ceil(pos)
  return s[lo] + (s[hi] - s[lo]) * (pos - lo)
}
export const median = (xs: number[]) => quantile(xs, 0.5)

/** Desviación estándar muestral (n − 1). */
export function sd(xs: number[]): number {
  if (xs.length < 2) return NaN
  const m = mean(xs)
  return Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1))
}

// ---------------------------------------------------------------------------
// Funciones especiales
// ---------------------------------------------------------------------------
export function lnGamma(z: number): number {
  const g = 7
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z)
  z -= 1
  let x = c[0]
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i)
  const t = z + g + 0.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
}

/** Gamma incompleta regularizada superior Q(a, x). */
export function gammaQ(a: number, x: number): number {
  if (x < 0 || a <= 0) return NaN
  if (x === 0) return 1
  if (x < a + 1) {
    let ap = a, del = 1 / a, s = del
    for (let n = 0; n < 500; n++) { ap++; del *= x / ap; s += del; if (Math.abs(del) < Math.abs(s) * 1e-14) break }
    return 1 - s * Math.exp(-x + a * Math.log(x) - lnGamma(a))
  }
  let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a); b += 2
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300
    d = 1 / d; const del = d * c; h *= del
    if (Math.abs(del - 1) < 1e-14) break
  }
  return Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h
}
export const chiSquareSf = (x: number, df: number) => gammaQ(df / 2, x / 2)

function betacf(a: number, b: number, x: number): number {
  const qab = a + b, qap = a + 1, qam = a - 1
  let c = 1, d = 1 - (qab * x) / qap
  if (Math.abs(d) < 1e-300) d = 1e-300
  d = 1 / d
  let h = d
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300
    c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300
    d = 1 / d; h *= d * c
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300
    c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300
    d = 1 / d
    const del = d * c; h *= del
    if (Math.abs(del - 1) < 1e-14) break
  }
  return h
}
/** Beta incompleta regularizada I_x(a, b). */
export function betaI(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b
}
/** P(|T| > |t|) para t de Student con df grados de libertad. */
export const tTwoSidedP = (t: number, df: number) => betaI(df / (df + t * t), df / 2, 0.5)
/** Cuantil t (bilateral) por bisección: devuelve t tal que P(|T|>t) = alpha. */
export function tCritical(alpha: number, df: number): number {
  let lo = 0, hi = 1000
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (tTwoSidedP(mid, df) > alpha) lo = mid; else hi = mid }
  return (lo + hi) / 2
}

// ---------------------------------------------------------------------------
// Intervalos de confianza
// ---------------------------------------------------------------------------
/** IC de Wilson para una proporción (recomendado para n pequeños y p cercanas a 0 o 1). */
export function wilson(k: number, n: number, z = 1.959963984540054): { p: number; lo: number; hi: number } | null {
  if (n <= 0) return null
  const p = k / n, z2 = z * z
  const den = 1 + z2 / n
  const center = (p + z2 / (2 * n)) / den
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den
  return { p, lo: Math.max(0, center - half), hi: Math.min(1, center + half) }
}
/** IC t para la media (requiere n ≥ 2). */
export function meanCI(xs: number[], level = 0.95): { m: number; lo: number; hi: number } | null {
  if (xs.length < 2) return null
  const m = mean(xs), se = sd(xs) / Math.sqrt(xs.length), t = tCritical(1 - level, xs.length - 1)
  return { m, lo: m - t * se, hi: m + t * se }
}

// ---------------------------------------------------------------------------
// Tablas de contingencia
// ---------------------------------------------------------------------------
export type Crosstab = { rows: string[]; cols: string[]; counts: number[][] }

export function crosstab<T>(data: T[], rowFn: (d: T) => string | null, colFn: (d: T) => string | null, rowLevels?: readonly string[], colLevels?: readonly string[]): Crosstab {
  const pairs = data.map((d) => [rowFn(d), colFn(d)] as const).filter(([r, c]) => r !== null && c !== null) as [string, string][]
  const rows = rowLevels ? [...rowLevels] : [...new Set(pairs.map((p) => p[0]))].sort()
  const cols = colLevels ? [...colLevels] : [...new Set(pairs.map((p) => p[1]))].sort()
  const counts = rows.map(() => cols.map(() => 0))
  for (const [r, c] of pairs) { const i = rows.indexOf(r), j = cols.indexOf(c); if (i >= 0 && j >= 0) counts[i][j]++ }
  return { rows, cols, counts }
}

/** Elimina filas/columnas sin observaciones (no aportan grados de libertad). */
export function dropEmpty(t: Crosstab): Crosstab {
  const keepR = t.counts.map((r) => sum(r) > 0)
  const keepC = t.cols.map((_, j) => sum(t.counts.map((r) => r[j])) > 0)
  return {
    rows: t.rows.filter((_, i) => keepR[i]),
    cols: t.cols.filter((_, j) => keepC[j]),
    counts: t.counts.filter((_, i) => keepR[i]).map((r) => r.filter((_, j) => keepC[j])),
  }
}

export type TestResult = {
  method: string
  n: number
  statistic?: number
  df?: number
  p?: number
  effect?: { name: string; value: number; label: string }
  assumptionsMet: boolean
  notes: string[]
}

function cramerLabel(v: number, dfMin: number): string {
  // Umbrales de Cohen ajustados por df* = min(r, c) − 1
  const t = dfMin === 1 ? [0.1, 0.3, 0.5] : dfMin === 2 ? [0.07, 0.21, 0.35] : [0.06, 0.17, 0.29]
  return v < t[0] ? 'despreciable' : v < t[1] ? 'pequeño' : v < t[2] ? 'mediano' : 'grande'
}

/** Prueba de independencia: chi-cuadrado si se cumplen los supuestos de Cochran; Fisher exacto en 2×2 si no. */
export function independenceTest(raw: Crosstab): TestResult {
  const t = dropEmpty(raw)
  const R = t.rows.length, C = t.cols.length
  const n = sum(t.counts.map(sum))
  const notes: string[] = []
  if (R < 2 || C < 2) return { method: 'Sin prueba', n, assumptionsMet: false, notes: ['Se necesitan al menos 2 categorías con datos en cada variable.'] }
  if (n < 20) notes.push('N < 20: los resultados son muy inestables.')
  const rs = t.counts.map(sum), cs = t.cols.map((_, j) => sum(t.counts.map((r) => r[j])))
  const exp = rs.map((r) => cs.map((c) => (r * c) / n))
  const flat = exp.flat()
  const lt5 = flat.filter((e) => e < 5).length / flat.length
  const lt1 = flat.some((e) => e < 1)
  const cochran = lt5 <= 0.2 && !lt1
  const dfMin = Math.min(R, C) - 1

  let chi2 = 0
  for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) chi2 += (t.counts[i][j] - exp[i][j]) ** 2 / exp[i][j]
  const v = Math.sqrt(chi2 / (n * dfMin))

  if (cochran && n >= 20) {
    const df = (R - 1) * (C - 1)
    return { method: 'Chi-cuadrado de independencia de Pearson', n, statistic: chi2, df, p: chiSquareSf(chi2, df),
      effect: { name: 'V de Cramér', value: v, label: cramerLabel(v, dfMin) }, assumptionsMet: true, notes }
  }
  if (R === 2 && C === 2) {
    notes.push('Frecuencias esperadas bajas: se usa la prueba exacta de Fisher.')
    const [[a, b], [c, d]] = t.counts
    return { method: 'Prueba exacta de Fisher (bilateral)', n, p: fisher2x2(a, b, c, d),
      effect: { name: 'phi (|V|)', value: v, label: cramerLabel(v, 1) }, assumptionsMet: true, notes }
  }
  notes.push(`Supuestos no cumplidos: ${Math.round(lt5 * 100)}% de celdas con frecuencia esperada < 5${lt1 ? ' y alguna < 1' : ''}. No se informa p-valor. Considere agrupar categorías o recolectar más datos.`)
  return { method: 'Chi-cuadrado (no aplicable)', n, assumptionsMet: false, notes }
}

const lnFact = (k: number) => lnGamma(k + 1)
/** Fisher exacto bilateral para tabla 2×2 [[a,b],[c,d]]. */
export function fisher2x2(a: number, b: number, c: number, d: number): number {
  const r1 = a + b, r2 = c + d, c1 = a + c, n = r1 + r2
  const lp = (x: number) => lnFact(r1) + lnFact(r2) + lnFact(c1) + lnFact(n - c1) - lnFact(n) - lnFact(x) - lnFact(r1 - x) - lnFact(c1 - x) - lnFact(r2 - c1 + x)
  const pObs = lp(a)
  let p = 0
  for (let x = Math.max(0, c1 - r2); x <= Math.min(r1, c1); x++) { const l = lp(x); if (l <= pObs + 1e-7) p += Math.exp(l) }
  return Math.min(1, p)
}

// ---------------------------------------------------------------------------
// Rangos: Spearman y Kruskal–Wallis
// ---------------------------------------------------------------------------
export function ranks(xs: number[]): number[] {
  const idx = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0])
  const r = new Array<number>(xs.length)
  for (let i = 0; i < idx.length;) {
    let j = i
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++
    const avg = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg
    i = j + 1
  }
  return r
}
function pearson(x: number[], y: number[]): number {
  const mx = mean(x), my = mean(y)
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2 }
  return sxy / Math.sqrt(sxx * syy)
}
/** Correlación de Spearman (adecuada para variables ordinales), con p aproximado por t (n ≥ 10). */
export function spearman(x: number[], y: number[]): TestResult {
  const n = x.length
  const notes: string[] = []
  if (n < 10) return { method: 'Correlación de Spearman', n, assumptionsMet: false, notes: ['N < 10: no se calcula.'] }
  const rho = pearson(ranks(x), ranks(y))
  if (!Number.isFinite(rho)) return { method: 'Correlación de Spearman', n, assumptionsMet: false, notes: ['Una de las variables no tiene variación.'] }
  const t = rho * Math.sqrt((n - 2) / Math.max(1e-12, 1 - rho * rho))
  const a = Math.abs(rho)
  notes.push('Asociación monótona; no implica causalidad.')
  return { method: 'Correlación de Spearman (ρ)', n, statistic: rho, df: n - 2, p: tTwoSidedP(t, n - 2),
    effect: { name: 'ρ', value: rho, label: a < 0.1 ? 'despreciable' : a < 0.3 ? 'débil' : a < 0.5 ? 'moderada' : 'fuerte' }, assumptionsMet: true, notes }
}

/** Kruskal–Wallis con corrección por empates; requiere ≥ 5 observaciones por grupo. */
export function kruskalWallis(groups: Record<string, number[]>): TestResult {
  const entries = Object.entries(groups).filter(([, v]) => v.length > 0)
  const all = entries.flatMap(([, v]) => v)
  const n = all.length
  const notes: string[] = []
  if (entries.length < 2) return { method: 'Kruskal–Wallis', n, assumptionsMet: false, notes: ['Se necesitan al menos 2 grupos con datos.'] }
  const small = entries.filter(([, v]) => v.length < 5).map(([k]) => k)
  if (small.length) return { method: 'Kruskal–Wallis', n, assumptionsMet: false, notes: [`Grupos con menos de 5 observaciones: ${small.join(', ')}. No se informa p-valor.`] }
  const r = ranks(all)
  let off = 0, H = 0
  for (const [, v] of entries) { const rs = sum(r.slice(off, off + v.length)); H += (rs * rs) / v.length; off += v.length }
  H = (12 / (n * (n + 1))) * H - 3 * (n + 1)
  const counts = new Map<number, number>(); for (const x of all) counts.set(x, (counts.get(x) ?? 0) + 1)
  const tie = 1 - sum([...counts.values()].map((t) => t ** 3 - t)) / (n ** 3 - n)
  if (tie > 0) H /= tie
  const df = entries.length - 1
  const eps2 = H / (n - 1)
  notes.push('Compara distribuciones (rangos) entre grupos; no implica causalidad.')
  return { method: 'Kruskal–Wallis (H, corregido por empates)', n, statistic: H, df, p: chiSquareSf(H, df),
    effect: { name: 'ε²', value: eps2, label: eps2 < 0.01 ? 'despreciable' : eps2 < 0.08 ? 'pequeño' : eps2 < 0.26 ? 'mediano' : 'grande' }, assumptionsMet: true, notes }
}

export const fmtP = (p?: number) => (p === undefined ? '—' : p < 0.001 ? '< 0,001' : p.toFixed(3).replace('.', ','))
export const fmtNum = (x: number | null | undefined, d = 1) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : x.toLocaleString('es-CR', { minimumFractionDigits: d, maximumFractionDigits: d }))
export const fmtPct = (x: number | null | undefined, d = 1) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : `${(x * 100).toLocaleString('es-CR', { minimumFractionDigits: d, maximumFractionDigits: d })}%`)
