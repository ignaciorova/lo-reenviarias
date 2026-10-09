import { useMemo } from 'react'
import { useFiltered, Section, DataTable, Empty, TestResultView } from '../components'
import { declaredVsObserved, distribution } from '../../analytics/metrics'
import { COMPARTIO, POST, RESPONSABLE, VERIFICA, type SessionRow } from '../../analytics/types'
import { crosstab, fmtNum, fmtPct, independenceTest } from '../../analytics/stats'

export default function Behavior() {
  const f = useFiltered()
  const valid = useMemo(() => f?.sessions.filter((s) => s.is_valid) ?? [], [f])
  if (!f) return null
  const dvo = declaredVsObserved(f.sessions)
  const usedHint = (s: SessionRow) => ((s.hints_used ?? 0) > 0 ? 'Usó lupa' : 'No usó lupa')
  const ct = crosstab(valid, (s) => s.verifica, usedHint, VERIFICA, ['Usó lupa', 'No usó lupa'])

  return (
    <div>
      <h1 className="mb-3 font-display text-2xl font-bold">Análisis de comportamiento</h1>
      <p className="mb-4 text-sm text-muted">Sesiones válidas: {valid.length}. «Declarado» = lo que la persona dice hacer; «observado» = lo que hizo en el juego. Clasificar una noticia como real en el juego no equivale a compartirla en la vida real.</p>
      <Section title="¿Dicen verificar… y lo hicieron?" description="Comparación por respuesta a «¿Verificas una noticia antes de compartirla?».">
        {!valid.length ? <Empty /> : (
          <>
            <DataTable columns={['Declara', 'N', 'Aciertos promedio', '% usó al menos una lupa', '% de falsas aceptadas']}
              rows={dvo.map((g) => [g.grupo, g.n, fmtNum(g.aciertos_promedio), fmtPct(g.pct_uso_lupa), fmtPct(g.pct_acepta_falsas)])} />
            <h3 className="mt-4 font-bold">Verificación declarada vs uso efectivo de pistas</h3>
            <DataTable columns={['Declara', 'Usó lupa', 'No usó lupa']} rows={ct.rows.map((r, i) => [r, ...ct.counts[i]])} />
            <TestResultView r={independenceTest(ct)} />
            <p className="mt-2 text-xs text-muted">La lupa es un indicador muy limitado de «verificar»: solo hay 2 por partida y cuestan puntos.</p>
          </>
        )}
      </Section>
      <div className="grid gap-5 xl:grid-cols-2">
        {([['verifica', '¿Verificas antes de compartir?', VERIFICA], ['compartio_falso', '¿Has compartido algo falso?', COMPARTIO], ['responsable', '¿Quién tiene más responsabilidad?', RESPONSABLE], ['post_cambio', 'Después de jugar, ¿cambiarías?', POST]] as const).map(([k, t, lv]) => (
          <Section key={k} title={t} description={`Sesiones válidas que respondieron.`}>
            <DataTable columns={['Opción', 'n', '%']} rows={distribution(valid, k, lv).map((r) => [r.opcion, r.n, fmtPct(r.pct)])} />
          </Section>
        ))}
      </div>
    </div>
  )
}
