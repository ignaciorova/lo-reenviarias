import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useMemo } from 'react'
import { useFiltered, Kpi, Section, Empty, PURPLE, GOLD, REAL, FAKE, GREY } from '../components'
import { computeKpis, declaredVsObserved, distribution, itemStats, scoreDistribution, sessionsByDate } from '../../analytics/metrics'
import { POST } from '../../analytics/types'
import { fmtNum, fmtPct } from '../../analytics/stats'

const pct = (v: number) => `${Math.round(v * 100)}%`

export default function Dashboard() {
  const f = useFiltered()
  const m = useMemo(() => {
    if (!f) return null
    const validIds = new Set(f.sessions.filter((s) => s.is_valid).map((s) => s.session_id))
    const dValid = f.decisions.filter((d) => validIds.has(d.session_id))
    const items = itemStats(dValid).map((i) => ({ ...i, short: i.item_key }))
    return {
      k: computeKpis(f.sessions, f.decisions),
      byDate: sessionsByDate(f.sessions),
      scores: scoreDistribution(f.sessions),
      items,
      fakes: items.filter((i) => i.correct_classification === 'falsa').map((i) => ({ short: i.item_key, aceptada: i.n ? i.accepted / i.n : 0, n: i.n })),
      hints: items.map((i) => ({ short: i.item_key, uso: i.hintRate, n: i.n })),
      dvo: declaredVsObserved(f.sessions).map((g) => ({ ...g, aciertos_promedio: Number.isFinite(g.aciertos_promedio) ? g.aciertos_promedio : 0, pct_uso_lupa: Number.isFinite(g.pct_uso_lupa) ? g.pct_uso_lupa : 0 })),
      post: distribution(f.sessions.filter((s) => s.is_valid), 'post_cambio', POST),
    }
  }, [f])
  if (!m) return null
  const { k } = m

  return (
    <div>
      <h1 className="mb-3 font-display text-2xl font-bold">Resumen ejecutivo</h1>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Sesiones iniciadas" value={k.started.toLocaleString('es-CR')} sub={`${k.incomplete} incompletas · ${k.excluded} excluidas · ${k.tests} de prueba (aparte)`} def="Sesiones con aceptación informada registrada, excluyendo las marcadas como prueba." />
        <Kpi label="Completadas" value={k.completed.toLocaleString('es-CR')} sub={`Tasa de finalización ${fmtPct(k.completionRate)}`} def="Sesiones con las 10 decisiones y la pregunta final registradas. Tasa = completadas ÷ iniciadas. Los datos migrados de la versión 1.0.0 solo contienen sesiones completadas, lo que infla la tasa si se incluyen." />
        <Kpi label="Sesiones válidas" value={k.valid.toLocaleString('es-CR')} sub="Base de los indicadores siguientes" def="Completadas, no excluidas por control de calidad, no de prueba y con 10 decisiones." />
        <Kpi label="Aciertos promedio" value={fmtNum(k.meanCorrect)} sub={`Mediana ${fmtNum(k.medianCorrect)} · DE ${fmtNum(k.sdCorrect)} (de 10)`} def="Media aritmética de noticias clasificadas correctamente por sesión válida. Tiempo agotado = no acierto." />
        <Kpi label="Clasificación correcta" value={fmtPct(k.accuracy)} sub={k.accuracyCI ? `IC 95% ${fmtPct(k.accuracyCI.lo)}–${fmtPct(k.accuracyCI.hi)} · ${k.decisions} decisiones` : undefined} def="Decisiones correctas ÷ decisiones totales de sesiones válidas. IC de Wilson; asume independencia entre decisiones (supuesto débil: hay 10 por persona)." />
        <Kpi label="Aceptación de falsas" value={fmtPct(k.fakeAcceptance)} sub={`${k.fakeDecisions} decisiones sobre noticias falsas`} def="Decisiones «Real / La reenvío» sobre noticias falsas ÷ todas las decisiones sobre noticias falsas (incluye tiempo agotado en el denominador)." />
        <Kpi label="Rechazo de verdaderas" value={fmtPct(k.realRejection)} sub={`${k.realDecisions} decisiones sobre noticias reales`} def="Decisiones «Falsa» sobre noticias reales ÷ todas las decisiones sobre noticias reales (incluye tiempo agotado en el denominador)." />
        <Kpi label="Uso de pistas" value={fmtPct(k.sessionsWithHint)} sub={`${fmtPct(k.hintsPerDecision)} de las decisiones con lupa`} def="Sesiones válidas con al menos una lupa ÷ sesiones válidas." />
        <Kpi label="Duración mediana" value={Number.isFinite(k.medianDuration) ? `${Math.floor(k.medianDuration / 60)} min ${Math.round(k.medianDuration % 60)} s` : '—'} def="Mediana de (fin − inicio) en sesiones válidas. Incluye preguntas y lectura de retroalimentación." />
        <Kpi label="Dice que verificaría más" value={fmtPct(k.verifyMoreRate)} sub={`n = ${k.verifyMoreN} respuestas`} def="«Sí, verificaría más» ÷ sesiones válidas que respondieron la pregunta final. Es una intención declarada inmediatamente después del juego, no un cambio de conducta observado." />
        <Kpi label="Tiempo agotado" value={fmtPct(k.timeoutRate)} def="Decisiones sin respuesta en 20 s ÷ decisiones de sesiones válidas." />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Section title="1. Participaciones por fecha" description="Por fecha de inicio (UTC).">
          {m.byDate.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={m.byDate}><CartesianGrid stroke="#eee" /><XAxis dataKey="date" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip /><Legend />
                <Line isAnimationActive={false} dataKey="iniciadas" stroke={GREY} strokeWidth={2} dot={false} /><Line isAnimationActive={false} dataKey="completadas" stroke={PURPLE} strokeWidth={2} dot={false} /><Line isAnimationActive={false} dataKey="validas" name="válidas" stroke={GOLD} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </Section>
        <Section title="2. Distribución de aciertos" description="Número de sesiones válidas según aciertos (0–10).">
          {k.valid ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={m.scores}><CartesianGrid stroke="#eee" /><XAxis dataKey="aciertos" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip /><Bar isAnimationActive={false} dataKey="sesiones" fill={PURPLE} /></BarChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </Section>
        <Section title="3. Aciertos por noticia" description="Proporción de decisiones correctas (sesiones válidas). Verde = noticia real, rojo = falsa.">
          {m.items.length ? <ItemBar data={m.items.map((i) => ({ short: i.short, v: i.accuracy, n: i.n, real: i.correct_classification === 'real' }))} /> : <Empty />}
        </Section>
        <Section title="4. Errores por noticia" description="Proporción de decisiones incorrectas o sin tiempo.">
          {m.items.length ? <ItemBar data={[...m.items].sort((a, b) => b.errorRate - a.errorRate).map((i) => ({ short: i.short, v: i.errorRate, n: i.n, real: i.correct_classification === 'real' }))} /> : <Empty />}
        </Section>
        <Section title="5. Noticias falsas aceptadas como reales" description="Proporción de decisiones que clasificaron cada noticia falsa como real.">
          {m.fakes.length ? <ItemBar data={m.fakes.map((i) => ({ short: i.short, v: i.aceptada, n: i.n, real: false }))} /> : <Empty />}
        </Section>
        <Section title="6. Uso de pistas por noticia" description="Proporción de decisiones en las que se usó lupa.">
          {m.hints.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={m.hints} layout="vertical" margin={{ left: 20 }}><CartesianGrid stroke="#eee" /><XAxis type="number" domain={[0, 1]} tickFormatter={pct} fontSize={11} /><YAxis type="category" dataKey="short" width={90} fontSize={11} /><Tooltip formatter={(v) => pct(Number(v))} /><Bar isAnimationActive={false} dataKey="uso" fill={GOLD} /></BarChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </Section>
        <Section title="7. Comportamiento declarado vs observado" description="Según la respuesta a «¿Verificas una noticia antes de compartirla?»: aciertos promedio y % que usó al menos una lupa.">
          {k.valid ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={m.dvo}><CartesianGrid stroke="#eee" /><XAxis dataKey="grupo" fontSize={11} tickFormatter={(g) => `${g} (n=${m.dvo.find((x) => x.grupo === g)?.n})`} />
                <YAxis yAxisId="a" domain={[0, 10]} fontSize={11} /><YAxis yAxisId="b" orientation="right" domain={[0, 1]} tickFormatter={pct} fontSize={11} /><Tooltip /><Legend />
                <Bar isAnimationActive={false} yAxisId="a" dataKey="aciertos_promedio" name="Aciertos promedio" fill={PURPLE} /><Bar isAnimationActive={false} yAxisId="b" dataKey="pct_uso_lupa" name="% usó lupa" fill={GOLD} />
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </Section>
        <Section title="8. Respuestas posteriores al juego" description="«¿Cambiarías tu forma de compartir noticias?» (intención declarada).">
          {k.valid ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={m.post}><CartesianGrid stroke="#eee" /><XAxis dataKey="opcion" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip /><Bar isAnimationActive={false} dataKey="n" name="Sesiones" fill={REAL} /></BarChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </Section>
      </div>
      <p className="text-xs text-muted">El «alcance simulado» del juego es un número aleatorio ilustrativo y no se presenta aquí como indicador de difusión.</p>
    </div>
  )
}

function ItemBar({ data }: { data: { short: string; v: number; n: number; real: boolean }[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 28 + 40)}>
      <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
        <CartesianGrid stroke="#eee" /><XAxis type="number" domain={[0, 1]} tickFormatter={pct} fontSize={11} />
        <YAxis type="category" dataKey="short" width={90} fontSize={11} />
        <Tooltip formatter={(v, _n, p) => [`${pct(Number(v))} (n=${(p.payload as { n: number }).n})`, 'Proporción']} />
        <Bar isAnimationActive={false} dataKey="v" shape={(props: unknown) => { const p = props as { x: number; y: number; width: number; height: number; payload: { real: boolean } }; return <rect x={p.x} y={p.y} width={p.width} height={p.height} fill={p.payload.real ? REAL : FAKE} /> }} />
      </BarChart>
    </ResponsiveContainer>
  )
}
