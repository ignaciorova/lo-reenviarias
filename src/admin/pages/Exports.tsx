import { useState } from 'react'
import { useData } from '../data'
import { useFiltered, Section } from '../components'
import { describeFilters } from '../../analytics/metrics'
import { decisionsTable, dictionaryTable, metadataTable, sessionsTable, summaryTable } from '../../analytics/datasets'
import { download, toCSV, toXLSX, toZip, type Table } from '../../analytics/export'
import type { DecisionRow, SessionRow } from '../../analytics/types'
import { canExport, exportDataset, VIEWER_EXPORT_NOTE } from '../exportDataset'

export default function Exports() {
  const { data, filters, profile } = useData()
  const f = useFiltered()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  if (!data || !f) return null
  const allowed = canExport(profile)
  const now = new Date()
  const stamp = now.toISOString().replace(/[:T]/g, '-').slice(0, 16)
  const versions = [...new Set(f.sessions.map((s) => s.instrument_version))].sort()
  const desc = describeFilters(filters)
  const base = `lo-reenviarias_v${versions.join('-') || 'na'}_${stamp}`

  // Las filas salen del servidor (export_dataset), que registra cada descarga en la auditoría.
  const fetchSessions = (formato: 'csv' | 'xlsx' | 'zip') =>
    exportDataset<SessionRow>('sesiones', { rowIds: f.sessions.map((s) => s.session_id), descripcion: desc, formato })
  const fetchDecisions = (formato: 'csv' | 'xlsx' | 'zip') =>
    exportDataset<DecisionRow>('decisiones', { rowIds: f.decisions.map((d) => d.decision_id), descripcion: desc, formato })
  const meta = (s: SessionRow[], d: DecisionRow[]) => metadataTable({ extractedAt: now.toISOString(), filters: desc, versions, nSessions: s.length, nDecisions: d.length })
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr(null)
    try { await fn() } catch (e) { setErr(e instanceof Error ? e.message : 'No se pudo exportar.') } finally { setBusy(false) }
  }
  const csv = (t: Table) => download(`${base}_${t.name}.csv`, toCSV(t), 'text/csv;charset=utf-8')
  const all = async (formato: 'xlsx' | 'zip') => {
    const s = await fetchSessions(formato), d = await fetchDecisions(formato)
    return [sessionsTable(s), decisionsTable(d), summaryTable(s, d), dictionaryTable(), meta(s, d)]
  }
  const xlsx = () => run(async () => download(`${base}.xlsx`, toXLSX(await all('xlsx')), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))
  const zip = () => run(async () => { const ts = await all('zip'); download(`${base}.zip`, toZip(Object.fromEntries(ts.map((t) => [`${t.name}.csv`, toCSV(t)]))), 'application/zip') })
  const btn = 'rounded-lg border border-soft bg-white px-3 py-2 hover:bg-lav disabled:cursor-not-allowed disabled:opacity-50'
  const off = !allowed || busy

  return (
    <div>
      <h1 className="mb-3 font-display text-2xl font-bold">Exportación de datos</h1>
      {!allowed && <p role="note" className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{VIEWER_EXPORT_NOTE}</p>}
      {err && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{err}</p>}
      <Section title="Datos que se exportarán" description="Las exportaciones respetan los filtros activos e incluyen todas las filas (sin límite de paginación). Las filas las entrega el servidor, que registra cada descarga en la auditoría (conjunto, número de filas, filtros, persona y hora).">
        <ul className="list-disc pl-5 text-sm">
          <li><b>{f.sessions.length.toLocaleString('es-CR')}</b> sesiones (de {data.sessions.length.toLocaleString('es-CR')} cargadas) y <b>{f.decisions.length.toLocaleString('es-CR')}</b> decisiones.</li>
          <li>Versiones del instrumento: {versions.join(', ') || '—'}.</li>
          <li>Criterios: {desc}.</li>
          <li>Fecha de extracción: {now.toLocaleString('es-CR')} (se guarda en UTC en la hoja «metadatos»).</li>
        </ul>
      </Section>
      <Section title="Libro completo">
        <div className="flex flex-wrap gap-2">
          <button disabled={off} onClick={() => void xlsx()} className="rounded-lg bg-u px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">Excel (.xlsx) con todas las hojas</button>
          <button disabled={off} onClick={() => void zip()} className="rounded-lg border border-u px-4 py-2 font-bold text-u disabled:cursor-not-allowed disabled:opacity-50">Paquete .zip de CSV</button>
        </div>
        <p className="mt-2 text-xs text-muted">Hojas: participantes, decisiones, resumen, diccionario, metadatos.</p>
      </Section>
      <Section title="Archivos individuales (CSV para Excel)" description="UTF-8 con BOM, separador «;» y coma decimal (configuración regional de Costa Rica).">
        <div className="flex flex-wrap gap-2">
          <button disabled={off} onClick={() => void run(async () => csv(sessionsTable(await fetchSessions('csv'))))} className={btn}>Dataset por participante</button>
          <button disabled={off} onClick={() => void run(async () => csv(decisionsTable(await fetchDecisions('csv'))))} className={btn}>Dataset por decisión</button>
          <button disabled={off} onClick={() => void run(async () => { const s = await fetchSessions('csv'); csv(summaryTable(s, await fetchDecisions('csv'))) })} className={btn}>Resumen agregado</button>
          <button onClick={() => csv(dictionaryTable())} className={btn}>Diccionario de variables</button>
          <button onClick={() => csv(meta(f.sessions, f.decisions))} className={btn}>Metadatos de extracción</button>
        </div>
      </Section>
    </div>
  )
}
