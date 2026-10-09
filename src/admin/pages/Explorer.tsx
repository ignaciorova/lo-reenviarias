import { Fragment, useMemo, useState } from 'react'
import { useFiltered, Section, Empty } from '../components'
import type { SessionRow } from '../../analytics/types'

const PAGE = 50

export default function Explorer() {
  const f = useFiltered()
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState<string | null>(null)
  const [sort, setSort] = useState<'recent' | 'score' | 'correct'>('recent')

  const rows = useMemo(() => {
    if (!f) return []
    const needle = q.trim().toLowerCase()
    const r = f.sessions.filter((s) => !needle || s.session_id.startsWith(needle) || (s.opinion ?? '').toLowerCase().includes(needle))
    const by: Record<typeof sort, (a: SessionRow, b: SessionRow) => number> = {
      recent: (a, b) => b.started_at.localeCompare(a.started_at),
      score: (a, b) => (b.score ?? -1) - (a.score ?? -1),
      correct: (a, b) => (b.correct_count ?? -1) - (a.correct_count ?? -1),
    }
    return r.sort(by[sort])
  }, [f, q, sort])
  if (!f) return null
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const view = rows.slice(page * PAGE, page * PAGE + PAGE)
  const decisionsOf = (id: string) => f.decisions.filter((d) => d.session_id === id).sort((a, b) => (a.position ?? 99) - (b.position ?? 99))

  return (
    <div>
      <h1 className="mb-3 font-display text-2xl font-bold">Explorador de respuestas</h1>
      <Section title={`${rows.length.toLocaleString('es-CR')} sesiones`} description="Cada fila es una participación anónima. Abre una fila para ver sus 10 decisiones."
        actions={
          <div className="flex flex-wrap gap-2">
            <input className="inp w-56" placeholder="Buscar en opinión o ID…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} aria-label="Buscar" />
            <select className="inp w-40" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Ordenar">
              <option value="recent">Más recientes</option><option value="correct">Más aciertos</option><option value="score">Más puntos</option>
            </select>
          </div>
        }>
        {!rows.length ? <Empty /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left">{['', 'Inicio', 'Versión', 'Estado', 'Verifica', 'Aciertos', 'Puntos', 'Lupas', 'Duración', 'Opinión'].map((c) => <th key={c} scope="col" className="border-b border-soft px-2 py-1.5 whitespace-nowrap">{c}</th>)}</tr></thead>
              <tbody>
                {view.map((s) => (
                  <Fragment key={s.session_id}>
                    <tr className="border-b border-black/5 align-top hover:bg-lav/40">
                      <td className="px-2 py-1.5"><button aria-expanded={open === s.session_id} aria-label="Ver decisiones" onClick={() => setOpen(open === s.session_id ? null : s.session_id)} className="rounded border border-soft px-1.5">{open === s.session_id ? '−' : '+'}</button></td>
                      <td className="px-2 py-1.5 whitespace-nowrap tabular">{new Date(s.started_at).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td className="px-2 py-1.5">{s.instrument_version}</td>
                      <td className="px-2 py-1.5"><StatusPill s={s} /></td>
                      <td className="px-2 py-1.5">{s.verifica ?? '—'}</td>
                      <td className="px-2 py-1.5 tabular">{s.correct_count ?? `${s.decisions_count}/10 dec.`}</td>
                      <td className="px-2 py-1.5 tabular">{s.score ?? '—'}</td>
                      <td className="px-2 py-1.5 tabular">{s.hints_used ?? '—'}</td>
                      <td className="px-2 py-1.5 tabular">{s.duration_seconds !== null ? `${s.duration_seconds} s` : '—'}</td>
                      {/* Texto de participantes: React escapa el contenido (sin innerHTML), lo que evita XSS */}
                      <td className="max-w-md px-2 py-1.5 break-words">{s.opinion ?? '—'}</td>
                    </tr>
                    {open === s.session_id && (
                      <tr><td colSpan={10} className="bg-[#FBFAFC] px-4 py-3">
                        <p className="mb-2 text-xs text-muted">ID {s.session_id} · {s.origin} · dispositivo {s.device_class} · compartió falso: {s.compartio_falso ?? '—'} · responsable: {s.responsable ?? '—'} · después: {s.post_cambio ?? '—'}</p>
                        <ol className="space-y-1">
                          {decisionsOf(s.session_id).map((d) => (
                            <li key={d.decision_id} className="flex gap-2 text-sm">
                              <span className="w-6 tabular text-muted">{d.position ?? '·'}</span>
                              <span>{d.is_correct ? '✅' : d.timed_out ? '⏱️' : '❌'}</span>
                              <span className="flex-1">{d.headline} <span className="text-muted">— correcta: {d.correct_classification}; eligió: {d.choice ?? 'sin tiempo'}{d.hint_used ? '; con lupa' : ''}{d.response_ms !== null ? `; ${(d.response_ms / 1000).toFixed(1)} s` : ''}{d.points_awarded !== null ? `; +${d.points_awarded}` : ''}</span></span>
                            </li>
                          ))}
                        </ol>
                      </td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="mt-3 flex items-center gap-2 text-sm">
            <button disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded border border-soft px-3 py-1 disabled:opacity-40">Anterior</button>
            <span>Página {page + 1} de {pages}</span>
            <button disabled={page >= pages - 1} onClick={() => setPage(page + 1)} className="rounded border border-soft px-3 py-1 disabled:opacity-40">Siguiente</button>
          </div>
        )}
      </Section>
    </div>
  )
}

export function StatusPill({ s }: { s: SessionRow }) {
  const c: Record<SessionRow['status_effective'], string> = {
    completada: 'bg-green-100 text-green-900', en_curso: 'bg-blue-100 text-blue-900', abandonada: 'bg-gray-200 text-gray-800',
    excluida: 'bg-amber-100 text-amber-900', prueba: 'bg-purple-100 text-purple-900',
  }
  return <span className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${c[s.status_effective]}`}>{s.status_effective.replace('_', ' ')}{s.is_valid ? ' ✓' : ''}</span>
}
