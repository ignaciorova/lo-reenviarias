import { useMemo } from 'react'
import { useData } from '../data'
import { useFiltered, Section, DataTable, Empty } from '../components'
import { itemStats } from '../../analytics/metrics'
import { fmtNum, fmtPct, wilson } from '../../analytics/stats'

const VS: Record<string, string> = {
  verificada: 'Verificada', requiere_precision: 'Requiere precisión', requiere_correccion: 'Requiere corrección', ficticia_documentada: 'Ficticia documentada', pendiente: 'Pendiente',
}

export default function Items() {
  const { data } = useData()
  const f = useFiltered()
  const stats = useMemo(() => {
    if (!f) return []
    const valid = new Set(f.sessions.filter((s) => s.is_valid).map((s) => s.session_id))
    return itemStats(f.decisions.filter((d) => valid.has(d.session_id)))
  }, [f])
  if (!f || !data) return null
  return (
    <div>
      <h1 className="mb-3 font-display text-2xl font-bold">Analítica por noticia</h1>
      <Section title="Comparación entre noticias" description="Decisiones de sesiones válidas con los filtros actuales. Ordenadas de menor a mayor acierto. Tiempos: solo decisiones dentro del límite (excluye tiempo agotado).">
        {!stats.length ? <Empty /> : (
          <DataTable
            columns={['Noticia', 'Tipo', 'Categoría', 'N', 'Aciertos', '% acierto (IC 95%)', 'Errores', 'Sin tiempo', 'Lupas', 'Clasificada real', 'Mediana s', 'Media s', 'Fuente']}
            rows={stats.map((s) => {
              const ci = wilson(s.correct, s.n)
              return [
                <span title={s.headline}><b>{s.item_key}</b><br /><span className="text-xs text-muted">{s.headline.slice(0, 70)}{s.headline.length > 70 ? '…' : ''}</span></span>,
                s.correct_classification, s.category, s.n, s.correct,
                `${fmtPct(s.accuracy)} (${fmtPct(ci?.lo)}–${fmtPct(ci?.hi)})`, s.errors, s.timeouts, `${s.hints} (${fmtPct(s.hintRate, 0)})`,
                `${s.accepted} (${fmtPct(s.accepted / s.n, 0)})`, fmtNum(s.medianMs / 1000), fmtNum(s.meanMs / 1000),
                <span className={s.validation_status === 'verificada' || s.validation_status === 'ficticia_documentada' ? '' : 'text-amber-800'}>{VS[s.validation_status] ?? s.validation_status}</span>,
              ]
            })}
          />
        )}
      </Section>
      <Section title="Catálogo y verificación de fuentes" description="Estado de validación de cada noticia por versión del instrumento. Las marcadas «requiere» deben revisarse antes de publicar resultados académicos.">
        <DataTable
          columns={['Versión', 'Clave', 'Titular', 'Correcta', 'Fuente', 'Estado', 'Notas']}
          rows={data.items.map((i) => [
            data.studies.find((s) => s.id === i.study_id)?.version ?? '?', i.item_key, i.headline, i.is_real ? 'Real' : 'Falsa',
            i.source_url ? <a href={i.source_url} target="_blank" rel="noopener noreferrer" className="text-u underline">{i.source_name ?? 'enlace'}</a> : (i.source_name ?? '—'),
            VS[i.validation_status] ?? i.validation_status, <span className="text-xs">{i.validation_notes}</span>,
          ])}
        />
      </Section>
    </div>
  )
}
