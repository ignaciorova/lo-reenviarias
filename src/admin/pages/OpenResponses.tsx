import { useMemo, useState } from 'react'
import { useData } from '../data'
import { useFiltered, Section, Empty } from '../components'
import { supabase } from '../../lib/supabase'
import { download, toCSV } from '../../analytics/export'

export default function OpenResponses() {
  const { data, reload, profile } = useData()
  const f = useFiltered()
  const [q, setQ] = useState('')
  const [code, setCode] = useState('')
  const [onlyUncoded, setOnlyUncoded] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const canCode = profile.role !== 'viewer'

  const rows = useMemo(() => {
    if (!data || !f) return []
    const ids = new Set(f.sessions.map((s) => s.session_id))
    const needle = q.trim().toLowerCase()
    return data.openResponses.filter((r) => ids.has(r.session_id) && (!needle || r.text_value.toLowerCase().includes(needle)) && (!onlyUncoded || r.codes.length === 0))
  }, [data, f, q, onlyUncoded])
  const allCodes = useMemo(() => [...new Set(data?.openResponses.flatMap((r) => r.codes) ?? [])].sort(), [data])
  if (!data) return null

  const addCode = async (id: number, c: string) => {
    if (!c.trim()) return
    setErr(null)
    const { error } = await supabase().rpc('add_response_code', { p_response_id: id, p_code: c.trim() })
    if (error) setErr('No se pudo guardar el código.'); else void reload()
  }
  const removeCode = async (id: number, c: string) => {
    const { error } = await supabase().rpc('remove_response_code', { p_response_id: id, p_code: c })
    if (error) setErr('No se pudo quitar el código.'); else void reload()
  }
  const exportCsv = () => {
    const t = { name: 'abiertas', columns: ['response_id', 'session_id', 'instrument_version', 'pregunta', 'texto', 'codigos', 'fecha'], rows: rows.map((r) => [r.response_id, r.session_id, r.instrument_version, r.question_key, r.text_value, r.codes.join(' | '), r.created_at]) }
    download(`lo-reenviarias_abiertas_${new Date().toISOString().slice(0, 10)}.csv`, toCSV(t), 'text/csv;charset=utf-8')
    void supabase().rpc('log_export', { p_details: { dataset: 'abiertas', rows: rows.length } }).then(() => undefined)
  }

  const counts = allCodes.map((c) => [c, rows.filter((r) => r.codes.includes(c)).length] as const)

  return (
    <div>
      <h1 className="mb-3 font-display text-2xl font-bold">Preguntas abiertas</h1>
      <p className="mb-3 text-sm text-muted">Codificación manual por el equipo de investigación. No se usa clasificación automática: los códigos los asigna una persona y quedan auditados. Los textos pueden contener datos personales escritos por participantes; no los cites textualmente sin revisar.</p>
      {counts.length > 0 && (
        <Section title="Códigos asignados" description="Frecuencia en las respuestas visibles.">
          <div className="flex flex-wrap gap-2">{counts.map(([c, n]) => <span key={c} className="rounded-full bg-lav px-3 py-1 text-sm">{c}: <b>{n}</b></span>)}</div>
        </Section>
      )}
      <Section title={`${rows.length} respuestas`} actions={
        <div className="flex flex-wrap items-center gap-2">
          <input className="inp w-56" placeholder="Buscar palabras…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={onlyUncoded} onChange={(e) => setOnlyUncoded(e.target.checked)} /> Solo sin codificar</label>
          <button onClick={exportCsv} className="rounded-md bg-u px-3 py-1.5 text-sm font-bold text-white">Exportar CSV</button>
        </div>
      }>
        {err && <p role="alert" className="mb-2 text-sm text-red-700">{err}</p>}
        {canCode && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <label htmlFor="newcode">Código a aplicar:</label>
            <input id="newcode" list="codes" className="inp w-56" value={code} onChange={(e) => setCode(e.target.value)} maxLength={60} placeholder="p. ej. verifica-fuente" />
            <datalist id="codes">{allCodes.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
        )}
        {!rows.length ? <Empty /> : (
          <ul className="divide-y divide-black/5">
            {rows.map((r) => (
              <li key={r.response_id} className="py-2.5">
                <p className="whitespace-pre-wrap break-words">{r.text_value}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <span>{new Date(r.created_at).toLocaleDateString('es-CR')} · v{r.instrument_version} · {r.session_id.slice(0, 8)}</span>
                  {r.codes.map((c) => (
                    <span key={c} className="rounded-full bg-u/10 px-2 py-0.5 text-u">{c}{canCode && <button aria-label={`Quitar código ${c}`} className="ml-1" onClick={() => void removeCode(r.response_id, c)}>×</button>}</span>
                  ))}
                  {canCode && code.trim() && !r.codes.includes(code.trim()) && <button onClick={() => void addCode(r.response_id, code)} className="rounded-full border border-u px-2 py-0.5 text-u">+ {code.trim()}</button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
