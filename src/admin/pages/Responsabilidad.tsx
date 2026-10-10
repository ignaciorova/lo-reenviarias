import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { fetchAll } from '../data'
import { DataTable, Empty, Kpi, Section, TestResultView, FAKE, GREY, PURPLE, REAL } from '../components'
import { supabase } from '../../lib/supabase'
import { fmtPct } from '../../analytics/stats'
import { download, toCSV, toXLSX } from '../../analytics/export'
import {
  analysisSample, byPosition, itemTable, pairedComparison, summarize,
  v4DecisionsTable, v4DictionaryTable, v4SessionsTable, type Estimate, type ShareDecisionRow, type ShareSessionRow,
} from '../../analytics/v4'

const STATE_COLORS: Record<string, string> = { E1: FAKE, E2: '#E07A2E', E3: GREY, E4: '#2E7FB8', E5: '#5BA3D6', E6: REAL, E7: '#D9D3E0' }
const pctTick = (v: number) => `${Math.round(v * 100)}%`
const est = (e: Estimate) => (e ? fmtPct(e.m) : '—')
const ci = (e: Estimate) => (e && Number.isFinite(e.lo) ? `IC 95% ${fmtPct(e.lo)}–${fmtPct(e.hi)} · n = ${e.n}` : e ? `n = ${e.n}` : 'sin datos')

/** Panel de la versión 4.0.0: responsabilidad antes de compartir. Lee v_share_sessions y v_share_decisions (RLS: solo personal del estudio). */
export default function Responsabilidad() {
  const [rows, setRows] = useState<{ s: ShareSessionRow[]; d: ShareDecisionRow[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [firstOnly, setFirstOnly] = useState(true)
  const [includeTest, setIncludeTest] = useState(false)
  const [version, setVersion] = useState<string>('todas')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [s, d] = await Promise.all([fetchAll<ShareSessionRow>('v_share_sessions', 'started_at'), fetchAll<ShareDecisionRow>('v_share_decisions', 'decision_id')])
      setRows({ s: s.rows, d: d.rows })
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron cargar los datos de la 4.0.0') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const versions = useMemo(() => [...new Set(rows?.s.map((s) => s.instrument_version) ?? [])].sort(), [rows])
  const m = useMemo(() => (rows ? compute(rows.s, rows.d, version, firstOnly, includeTest) : null), [rows, version, firstOnly, includeTest])

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Responsabilidad antes de compartir <span className="text-base font-normal text-muted">(versión 4.x)</span></h1>
      <p className="mb-3 max-w-3xl text-sm text-muted">¿Qué responsabilidad asumen las personas antes de compartir información sin verificar? El indicador principal es la proporción de decisiones simuladas de difusión sin verificación previa. Todo se calcula por sesión y se promedia entre sesiones, así cada persona pesa igual.</p>
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-black/5 bg-white p-3 text-sm shadow-sm">
        <label className="flex items-center gap-2">Versión
          <select value={version} onChange={(e) => setVersion(e.target.value)} className="rounded-md border border-soft px-2 py-1">
            <option value="todas">Todas las 4.x</option>{versions.map((v) => <option key={v}>{v}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={firstOnly} onChange={(e) => setFirstOnly(e.target.checked)} /> Solo primeras partidas (análisis principal)</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={includeTest} onChange={(e) => setIncludeTest(e.target.checked)} /> Incluir sesiones de prueba</label>
        <button onClick={() => void load()} disabled={loading} className="ml-auto rounded-md border border-soft px-3 py-1 hover:bg-lav disabled:opacity-50">{loading ? 'Cargando…' : 'Actualizar'}</button>
      </div>
      {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {m && (m.sessions.length === 0 ? <Empty>Todavía no hay partidas de la versión 4.x.</Empty> : <Body m={m} firstOnly={firstOnly} />)}
    </div>
  )
}

function compute(all: ShareSessionRow[], allDecisions: ShareDecisionRow[], version: string, firstOnly: boolean, includeTest: boolean) {
  const sessions = version === 'todas' ? all : all.filter((s) => s.instrument_version === version)
  const { included, flow } = analysisSample(sessions, { firstOnly, includeTest })
  const ids = new Set(included.map((s) => s.session_id))
  const decisions = allDecisions.filter((d) => ids.has(d.session_id))
  return {
    sessions, included, flow, decisions,
    sum: summarize(included),
    byType: pairedComparison(decisions, ids, (d) => d.is_real, (d) => !d.is_real),
    byImage: pairedComparison(decisions, ids, (d) => d.image_shown, (d) => !d.image_shown),
    items: itemTable(decisions, ids),
    position: byPosition(decisions, ids),
  }
}
type M = ReturnType<typeof compute>

function Body({ m, firstOnly }: { m: M; firstOnly: boolean }) {
  const { sum, flow } = m
  return (
    <>
      <Section title="Muestra de análisis" description="Cada sesión excluida cae en un solo motivo, en este orden.">
        <ol className="grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Flow n={flow.total} l="sesiones de la 4.x" />
          <Flow n={-flow.test} l="de prueba" />
          <Flow n={-flow.excluded} l="excluidas por calidad" />
          <Flow n={-flow.incomplete} l="incompletas (E8: se informan aparte)" />
          {firstOnly && <Flow n={-flow.replay} l="repeticiones (no es la primera partida)" />}
          <Flow n={-flow.allTimeout} l="sin ninguna respuesta (todo E7)" />
          <Flow n={flow.included} l="incluidas" strong />
        </ol>
      </Section>
      {flow.included === 0 ? <Empty>No hay sesiones que cumplan los criterios.</Empty> : <>
        <div className="mb-5 grid gap-3 lg:grid-cols-3">
          <div className="rounded-xl border-2 border-u bg-white p-4 shadow-sm lg:col-span-1">
            <div className="text-xs font-bold tracking-wide text-muted uppercase">Indicador principal</div>
            <div className="text-sm font-bold">Difusión sin verificación previa</div>
            <div className="mt-1 font-display text-5xl font-bold text-u tabular">{est(sum.main)}</div>
            <div className="text-sm text-muted">{ci(sum.main)}</div>
            <p className="mt-2 text-xs text-muted">(E1 + E2) / R por sesión, promediado. IC t de Student sobre las medias por sesión. DE entre sesiones = {sum.main && Number.isFinite(sum.main.sd) ? sum.main.sd.toFixed(3).replace('.', ',') : '—'} (dato para recalcular la muestra).</p>
          </div>
          <Kpi label="Límite inferior por tiempo agotado" value={est(sum.lower)} sub={ci(sum.lower)} def="Todo E7 cuenta como «no reenvió»: (E1 + E2) / (R + E7). Si los dos límites quedan cerca del principal, el tiempo agotado no cambia la conclusión." />
          <Kpi label="Límite superior por tiempo agotado" value={est(sum.upper)} sub={ci(sum.upper)} def="Todo E7 cuenta como «reenvió sin verificar»: (E1 + E2 + E7) / (R + E7)." />
        </div>

        <h2 className="mb-2 font-display text-lg font-bold">Indicadores secundarios</h2>
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label="Inició una consulta" value={est(sum.verInit)} sub={ci(sum.verInit)} def="(E4 + E5 + E6) / R: eligió «Verificar primero». Es consulta, no verificación efectiva." />
          <Kpi label="Verificación efectiva" value={est(sum.verEff)} sub={ci(sum.verEff)} def="Verificaciones con fuente oficial o medio, al menos 2 s de lectura medida por el servidor y evaluación igual a lo que dice la fuente, sobre R. Es parte de la consulta iniciada." />
          <Kpi label="Evaluó bien la fuente" value={est(sum.evalCorrect)} sub={ci(sum.evalCorrect)} def="Evaluaciones correctas («la confirma / la desmiente / no dice nada claro») sobre consultas iniciadas. Solo sesiones que consultaron al menos una vez." />
          <Kpi label="Compartió con aviso" value={est(sum.warning)} sub={ci(sum.warning)} def="(E2 + E5) / (E1 + E2 + E4 + E5): de lo que reenvió, cuánto fue con aviso. Solo sesiones que reenviaron algo." />
          <Kpi label="Dijo «No sé»" value={est(sum.noSe)} sub={ci(sum.noSe)} def="Respuestas «No sé» / R. Reconocimiento declarado de incertidumbre (se pregunta después de decidir)." />
          <Kpi label="Precisión de la creencia" value={est(sum.accuracy)} sub={ci(sum.accuracy)} def="Creencias correctas / respuestas Sí o No. Creencia declarada después de decidir: puede ajustarse para justificar la decisión." />
          <Kpi label="Discernimiento" value={sum.discernment ? `${(sum.discernment.m * 100).toFixed(1).replace('.', ',')} pp` : '—'} sub={sum.discernment && Number.isFinite(sum.discernment.lo) ? `IC 95% ${(sum.discernment.lo * 100).toFixed(1).replace('.', ',')} a ${(sum.discernment.hi * 100).toFixed(1).replace('.', ',')} pp · n = ${sum.discernment.n}` : undefined} def="P(Sí | real) − P(Sí | falsa) por sesión. 0 = no distingue; 100 pp = distingue siempre." />
          <Kpi label="No reenvió sin verificar" value={est(sum.noShare)} sub={ci(sum.noShare)} def="E3 / R. Con el principal y la consulta iniciada suma 100 %." />
          <Kpi label="Difusión total" value={est(sum.shareTotal)} sub={ci(sum.shareTotal)} def="(E1 + E2 + E4 + E5) / R: reenvió, verificara o no." />
          <Kpi label="Tiempo agotado" value={est(sum.timeoutRate)} sub={ci(sum.timeoutRate)} def="E7 / noticias presentadas. Calidad y diseño; no es una decisión." />
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <Section title="Distribución del indicador principal" description="Sesiones según su proporción de difusión sin verificar.">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={sum.distribution}><CartesianGrid stroke="#eee" /><XAxis dataKey="tramo" fontSize={10} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip /><Bar isAnimationActive={false} dataKey="sesiones" fill={PURPLE} /></BarChart>
            </ResponsiveContainer>
          </Section>
          <Section title="Estados de todas las noticias" description="E1 reenvió sin verificar · E2 con aviso sin verificar · E3 no reenvió · E4–E6 verificó y luego reenvió, con aviso o no · E7 tiempo agotado.">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={sum.states}><CartesianGrid stroke="#eee" /><XAxis dataKey="state" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip />
                <Bar isAnimationActive={false} dataKey="n" name="Noticias">{sum.states.map((s) => <Cell key={s.state} fill={STATE_COLORS[s.state]} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </Section>
          <Section title="Por tipo de noticia (descriptivo)" description="Difusión sin verificar en las noticias confirmadas frente a las falsas, comparada dentro de cada sesión.">
            <Pair a={m.byType.a} b={m.byType.b} la="Confirmadas" lb="Falsas" />
            <TestResultView r={m.byType.test} />
          </Section>
          <Section title="Con imagen y sin imagen (exploratorio)" description="La imagen se asigna al azar a la mitad de las tarjetas de cada partida, equilibrando reales y falsas. Comparación dentro de cada sesión.">
            <Pair a={m.byImage.a} b={m.byImage.b} la="Con imagen" lb="Sin imagen" />
            <TestResultView r={m.byImage.test} />
            <p className="mt-2 text-xs text-muted">Exploratorio: con 5 tarjetas por condición, la medición por persona es gruesa. Un resultado no significativo no demuestra ausencia de efecto.</p>
          </Section>
          <Section title="A lo largo de la partida" description="Difusión sin verificar según la posición de la noticia (1 a 10). El orden de las noticias es aleatorio.">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={m.position}><CartesianGrid stroke="#eee" /><XAxis dataKey="posicion" fontSize={11} /><YAxis domain={[0, 1]} tickFormatter={pctTick} fontSize={11} />
                <Tooltip formatter={(v, _n, p) => [`${pctTick(Number(v))} (n=${(p.payload as { n: number }).n})`, 'Difusión sin verificar']} />
                <Line isAnimationActive={false} dataKey="dsv" stroke={PURPLE} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </Section>
        </div>

        <Section title="Por noticia" description="Conteos de estados y proporciones (descriptivo). Verde = confirmada, rojo = falsa.">
          <DataTable columns={['Noticia', 'n', 'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'Sin verificar', 'Consulta', 'Efectiva', 'Con aviso', '«No sé»', 'Creencia correcta', 'Con imagen']}
            rows={m.items.map((i) => [
              <span key="k" title={i.headline} className={`font-bold ${i.is_real ? 'text-real' : 'text-fake'}`}>{i.item_key}</span>, i.n, i.E1, i.E2, i.E3, i.E4, i.E5, i.E6, i.E7,
              fmtPct(i.dsv, 0), fmtPct(i.verInit, 0), fmtPct(i.verEff, 0), fmtPct(i.warning, 0), fmtPct(i.noSe, 0), fmtPct(i.accuracy, 0), fmtPct(i.withImage, 0),
            ])} />
        </Section>

        <SurveyNote />
        <Exports sessions={m.sessions} decisions={m.decisions} included={m.included} />
      </>}
    </>
  )
}

function Flow({ n, l, strong }: { n: number; l: string; strong?: boolean }) {
  return <li className={`rounded-lg px-3 py-2 ${strong ? 'bg-u text-white' : 'bg-lav/60'}`}><b className="tabular">{n < 0 ? `− ${-n}` : n}</b> {l}</li>
}

function Pair({ a, b, la, lb }: { a: Estimate; b: Estimate; la: string; lb: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 text-center">
      {[[la, a, REAL], [lb, b, FAKE]].map(([l, e, c]) => (
        <div key={l as string} className="rounded-lg bg-lav/50 p-3">
          <div className="text-xs text-muted">{l as string}</div>
          <div className="font-display text-2xl font-bold tabular" style={{ color: c as string }}>{est(e as Estimate)}</div>
          <div className="text-xs text-muted">{ci(e as Estimate)}</div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Encuesta: instrumento independiente. No se une con las partidas.
// ---------------------------------------------------------------------------
function SurveyNote() {
  return (
    <section aria-labelledby="enc-indep" className="mb-5 rounded-xl border-2 border-dashed border-soft bg-[#FBFAFC] p-4">
      <h2 id="enc-indep" className="font-display text-lg font-bold">Encuesta de hábitos: instrumento independiente</h2>
      <p className="mt-1 max-w-3xl text-sm">
        Todo lo de arriba sale <b>solo del juego</b> (decisiones simuladas). La encuesta de Google Forms (hábitos declarados de consumo, verificación, difusión y responsabilidad)
        se aplicó por separado y <b>no se vincula</b> con las partidas: no hay código común, así que no se sabe qué persona respondió qué.
      </p>
      <Limits>
        Si más adelante se incorporan los resultados agregados de la encuesta, se mostrarán en una sección aparte y solo a nivel de grupo.
        No se calculan correlaciones persona a persona entre hábitos y decisiones, ni se supone que las dos muestras sean las mismas personas:
        pueden diferir en quién participó, cuándo y cuántas veces. Una coincidencia o diferencia entre los dos instrumentos se describe, no se interpreta como relación individual.
      </Limits>
    </section>
  )
}

function Limits({ children }: { children: ReactNode }) {
  return <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{children}</p>
}

function Exports({ sessions, decisions, included }: { sessions: ShareSessionRow[]; decisions: ShareDecisionRow[]; included: ShareSessionRow[] }) {
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16)
  const base = `lo-reenviarias_v4_${stamp}`
  const log = (dataset: string, format: string, rows: number) => void supabase().rpc('log_export', { p_details: { dataset, format, rows } }).then(() => undefined)
  const csv = (t: ReturnType<typeof v4SessionsTable>) => { download(`${base}_${t.name}.csv`, toCSV(t), 'text/csv;charset=utf-8'); log(t.name, 'csv', t.rows.length) }
  const incIds = new Set(included.map((s) => s.session_id))
  return (
    <Section title="Exportar (4.x)" description="Todas las sesiones de la versión elegida, con la columna «valida» y los indicadores por sesión. Las decisiones exportadas son las de la muestra incluida. Cada descarga queda en la auditoría.">
      <div className="flex flex-wrap gap-2">
        <button onClick={() => { const ts = [v4SessionsTable(sessions), v4DecisionsTable(decisions), v4DictionaryTable()]; download(`${base}.xlsx`, toXLSX(ts), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); log('v4_completo', 'xlsx', sessions.length) }} className="rounded-lg bg-u px-4 py-2 font-bold text-white">Excel (.xlsx)</button>
        <button onClick={() => csv(v4SessionsTable(sessions))} className="rounded-lg border border-soft bg-white px-3 py-2 hover:bg-lav">Participantes (CSV)</button>
        <button onClick={() => csv(v4SessionsTable(sessions.filter((s) => incIds.has(s.session_id))))} className="rounded-lg border border-soft bg-white px-3 py-2 hover:bg-lav">Solo muestra incluida (CSV)</button>
        <button onClick={() => csv(v4DecisionsTable(decisions))} className="rounded-lg border border-soft bg-white px-3 py-2 hover:bg-lav">Decisiones (CSV)</button>
        <button onClick={() => csv(v4DictionaryTable())} className="rounded-lg border border-soft bg-white px-3 py-2 hover:bg-lav">Diccionario (CSV)</button>
      </div>
    </Section>
  )
}
