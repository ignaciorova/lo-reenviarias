import { useMemo, useState } from 'react'
import { useFiltered, Section, DataTable, Empty, TestResultView } from '../components'
import { COMPARTIO, POST, RESPONSABLE, VERIFICA, type SessionRow } from '../../analytics/types'
import { crosstab, fmtNum, fmtPct, independenceTest, kruskalWallis, mean, meanCI, median, quantile, sd, spearman, sum, wilson } from '../../analytics/stats'

type Cat = { key: string; label: string; levels: readonly string[]; get: (s: SessionRow) => string | null }
const CATS: Cat[] = [
  { key: 'verifica', label: 'Verificación declarada', levels: VERIFICA, get: (s) => s.verifica },
  { key: 'compartio_falso', label: 'Ha compartido algo falso', levels: COMPARTIO, get: (s) => s.compartio_falso },
  { key: 'responsable', label: 'Responsabilidad atribuida', levels: RESPONSABLE, get: (s) => s.responsable },
  { key: 'post_cambio', label: 'Respuesta posterior', levels: POST, get: (s) => s.post_cambio },
  { key: 'uso_lupa', label: 'Uso de pistas', levels: ['Usó lupa', 'No usó lupa'], get: (s) => (s.hints_used === null ? null : s.hints_used > 0 ? 'Usó lupa' : 'No usó lupa') },
  { key: 'desempeno', label: 'Desempeño (≥ 7 aciertos)', levels: ['Alto (7–10)', 'Bajo (0–6)'], get: (s) => (s.correct_count === null ? null : s.correct_count >= 7 ? 'Alto (7–10)' : 'Bajo (0–6)') },
  { key: 'acepto_falsa', label: 'Aceptó al menos una falsa', levels: ['Sí', 'No'], get: (s) => (s.fake_accepted_count === null ? null : s.fake_accepted_count > 0 ? 'Sí' : 'No') },
  { key: 'device', label: 'Dispositivo', levels: ['mobile', 'tablet', 'desktop', 'unknown'], get: (s) => s.device_class },
]
type Num = { key: string; label: string; unit: string; get: (s: SessionRow) => number | null }
const NUMS: Num[] = [
  { key: 'correct_count', label: 'Aciertos (0–10)', unit: 'noticias', get: (s) => s.correct_count },
  { key: 'score', label: 'Puntuación', unit: 'puntos', get: (s) => s.score },
  { key: 'hints_used', label: 'Lupas usadas', unit: 'lupas', get: (s) => s.hints_used },
  { key: 'fake_accepted_count', label: 'Falsas aceptadas (0–5)', unit: 'noticias', get: (s) => s.fake_accepted_count },
  { key: 'real_rejected_count', label: 'Reales rechazadas (0–5)', unit: 'noticias', get: (s) => s.real_rejected_count },
  { key: 'duration_seconds', label: 'Duración', unit: 'segundos', get: (s) => s.duration_seconds },
]
const ORD: Record<string, Record<string, number>> = {
  verifica: { 'Casi nunca': 1, 'A veces': 2, Siempre: 3 },
  post_cambio: { 'No, seguiré igual': 1, 'Tal vez': 2, 'Sí, verificaría más': 3 },
}

export default function Lab() {
  const f = useFiltered()
  const [numKey, setNumKey] = useState('correct_count')
  const [catKey, setCatKey] = useState('verifica')
  const [rowKey, setRowKey] = useState('verifica')
  const [colKey, setColKey] = useState('desempeno')
  const [grpKey, setGrpKey] = useState('verifica')
  const [ordKey, setOrdKey] = useState<'verifica' | 'post_cambio'>('verifica')

  const valid = useMemo(() => f?.sessions.filter((s) => s.is_valid) ?? [], [f])
  if (!f) return null
  const excluded = f.sessions.length - valid.length
  const versions = [...new Set(valid.map((s) => s.instrument_version))]

  const num = NUMS.find((n) => n.key === numKey)!
  const xs = valid.map(num.get).filter((x): x is number => x !== null)
  const ci = meanCI(xs)
  const freq = new Map<number, number>(); for (const x of xs) freq.set(x, (freq.get(x) ?? 0) + 1)

  const cat = CATS.find((c) => c.key === catKey)!
  const catVals = valid.map(cat.get).filter((x): x is string => x !== null)

  const rowC = CATS.find((c) => c.key === rowKey)!, colC = CATS.find((c) => c.key === colKey)!
  const ct = crosstab(valid, rowC.get, colC.get, rowC.levels, colC.levels)

  const grp = CATS.find((c) => c.key === grpKey)!
  const groups: Record<string, number[]> = {}
  for (const l of grp.levels) groups[l] = valid.filter((s) => grp.get(s) === l).map(num.get).filter((x): x is number => x !== null)

  const ordPairs = valid.map((s) => [ORD[ordKey][(ordKey === 'verifica' ? s.verifica : s.post_cambio) ?? ''], s.correct_count] as const).filter(([a, b]) => a !== undefined && b !== null) as [number, number][]

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Laboratorio de análisis</h1>
      <div className="my-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
        <b>Base:</b> {valid.length} sesiones válidas · <b>excluidas</b> por no ser válidas (incompletas, de prueba o excluidas por QA): {excluded} · versiones: {versions.join(', ') || '—'}.
        {versions.length > 1 && <> <b>Atención:</b> estás mezclando versiones del instrumento; filtra por una sola para resultados comparables.</>}
        {' '}Todos los análisis son exploratorios sobre una muestra por conveniencia. Ninguno permite inferir causalidad ni atribuir al juego un cambio de conducta.
      </div>

      <Section title="Análisis descriptivo: variable numérica" actions={<select className="inp w-56" value={numKey} onChange={(e) => setNumKey(e.target.value)} aria-label="Variable">{NUMS.map((n) => <option key={n.key} value={n.key}>{n.label}</option>)}</select>}>
        {xs.length === 0 ? <Empty /> : (
          <>
            <DataTable columns={['N', 'Media', 'IC 95% media (t)', 'Mediana', 'P25–P75', 'DE', 'Mín', 'Máx', 'Unidad']}
              rows={[[xs.length, fmtNum(mean(xs), 2), ci ? `${fmtNum(ci.lo, 2)} – ${fmtNum(ci.hi, 2)}` : '— (n < 2)', fmtNum(median(xs), 1), `${fmtNum(quantile(xs, 0.25), 1)} – ${fmtNum(quantile(xs, 0.75), 1)}`, fmtNum(sd(xs), 2), Math.min(...xs), Math.max(...xs), num.unit]]} />
            {num.key !== 'duration_seconds' && num.key !== 'score' && (
              <div className="mt-3"><DataTable caption="Distribución de frecuencias" columns={['Valor', 'n', '%']} rows={[...freq.entries()].sort((a, b) => a[0] - b[0]).map(([v, n]) => [v, n, fmtPct(n / xs.length)])} /></div>
            )}
            <p className="mt-2 text-xs text-muted">El IC t de la media supone muestreo aleatorio e independencia; con variables acotadas (0–10) y muestras pequeñas es aproximado.</p>
          </>
        )}
      </Section>

      <Section title="Frecuencias: variable categórica" actions={<select className="inp w-56" value={catKey} onChange={(e) => setCatKey(e.target.value)} aria-label="Variable">{CATS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>}>
        {catVals.length === 0 ? <Empty /> : (
          <DataTable columns={['Categoría', 'n', '%', 'IC 95% (Wilson)']} rows={cat.levels.map((l) => {
            const k = catVals.filter((v) => v === l).length; const w = wilson(k, catVals.length)
            return [l, k, fmtPct(k / catVals.length), w ? `${fmtPct(w.lo)} – ${fmtPct(w.hi)}` : '—']
          })} caption={`N = ${catVals.length} respuestas (sesiones válidas)`} />
        )}
      </Section>

      <Section title="Cruce de variables (tabla de contingencia)" description="Chi-cuadrado de Pearson si se cumplen los criterios de Cochran (≤ 20% de celdas con esperado < 5, ninguna < 1, N ≥ 20); Fisher exacto si es 2×2 y no se cumplen; en otro caso no se informa p-valor. Tamaño del efecto: V de Cramér."
        actions={<div className="flex flex-wrap gap-2">
          <select className="inp w-52" value={rowKey} onChange={(e) => setRowKey(e.target.value)} aria-label="Filas">{CATS.map((c) => <option key={c.key} value={c.key}>Filas: {c.label}</option>)}</select>
          <select className="inp w-52" value={colKey} onChange={(e) => setColKey(e.target.value)} aria-label="Columnas">{CATS.map((c) => <option key={c.key} value={c.key}>Columnas: {c.label}</option>)}</select>
        </div>}>
        {rowKey === colKey ? <Empty>Elige dos variables distintas.</Empty> : sum(ct.counts.flat()) === 0 ? <Empty /> : (
          <>
            <DataTable columns={[`${rowC.label} \\ ${colC.label}`, ...ct.cols, 'Total']}
              rows={[...ct.rows.map((r, i) => {
                const tot = sum(ct.counts[i])
                return [r, ...ct.counts[i].map((c) => `${c} (${tot ? Math.round((c / tot) * 100) : 0}%)`), tot]
              }), ['Total', ...ct.cols.map((_, j) => sum(ct.counts.map((r) => r[j]))), sum(ct.counts.flat())]]}
              caption="Frecuencias absolutas (porcentaje por fila)" />
            <TestResultView r={independenceTest(ct)} />
          </>
        )}
      </Section>

      <Section title="Comparación de grupos" description="Distribución de una variable numérica entre grupos. Prueba de Kruskal–Wallis (no paramétrica: no supone normalidad; requiere ≥ 5 casos por grupo). Efecto: ε²."
        actions={<div className="flex flex-wrap gap-2">
          <select className="inp w-52" value={numKey} onChange={(e) => setNumKey(e.target.value)} aria-label="Resultado">{NUMS.map((n) => <option key={n.key} value={n.key}>Resultado: {n.label}</option>)}</select>
          <select className="inp w-52" value={grpKey} onChange={(e) => setGrpKey(e.target.value)} aria-label="Grupos">{CATS.map((c) => <option key={c.key} value={c.key}>Grupos: {c.label}</option>)}</select>
        </div>}>
        <DataTable columns={['Grupo', 'n', 'Media', 'Mediana', 'DE']} rows={Object.entries(groups).map(([g, v]) => [g, v.length, fmtNum(mean(v), 2), fmtNum(median(v), 1), fmtNum(sd(v), 2)])} />
        <TestResultView r={kruskalWallis(groups)} />
      </Section>

      <Section title="Correlación ordinal" description="Spearman (ρ) entre una respuesta ordinal y los aciertos observados. Requiere N ≥ 10."
        actions={<select className="inp w-64" value={ordKey} onChange={(e) => setOrdKey(e.target.value as 'verifica' | 'post_cambio')} aria-label="Variable ordinal">
          <option value="verifica">Verificación declarada vs aciertos</option><option value="post_cambio">Respuesta posterior vs aciertos</option></select>}>
        <TestResultView r={spearman(ordPairs.map((p) => p[0]), ordPairs.map((p) => p[1]))} />
        {ordKey === 'post_cambio' && <p className="mt-2 text-xs text-muted">La pregunta posterior se responde después de ver el propio resultado; una asociación puede reflejar la retroalimentación recibida, no un cambio real de conducta.</p>}
      </Section>
    </div>
  )
}
