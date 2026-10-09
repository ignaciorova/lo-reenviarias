import { useData } from '../data'
import { useFiltered, Section } from '../components'
import { supabase } from '../../lib/supabase'
import { describeFilters } from '../../analytics/metrics'
import { decisionsTable, dictionaryTable, metadataTable, sessionsTable, summaryTable } from '../../analytics/datasets'
import { download, toCSV, toXLSX, toZip, type Table } from '../../analytics/export'

export default function Exports() {
  const { data, filters } = useData()
  const f = useFiltered()
  if (!data || !f) return null
  const now = new Date()
  const stamp = now.toISOString().replace(/[:T]/g, '-').slice(0, 16)
  const versions = [...new Set(f.sessions.map((s) => s.instrument_version))].sort()
  const meta = metadataTable({ extractedAt: now.toISOString(), filters: describeFilters(filters), versions, nSessions: f.sessions.length, nDecisions: f.decisions.length })
  const tables = (): Table[] => [sessionsTable(f.sessions), decisionsTable(f.decisions), summaryTable(f.sessions, f.decisions), dictionaryTable(), meta]
  const base = `lo-reenviarias_v${versions.join('-') || 'na'}_${stamp}`

  const log = (dataset: string, format: string, rows: number) =>
    void supabase().rpc('log_export', { p_details: { dataset, format, rows, filters: describeFilters(filters) } }).then(() => undefined)

  const csv = (t: Table) => { download(`${base}_${t.name}.csv`, toCSV(t), 'text/csv;charset=utf-8'); log(t.name, 'csv', t.rows.length) }
  const xlsx = () => { const ts = tables(); download(`${base}.xlsx`, toXLSX(ts), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); log('completo', 'xlsx', f.sessions.length) }
  const zip = () => {
    const ts = tables()
    download(`${base}.zip`, toZip(Object.fromEntries(ts.map((t) => [`${t.name}.csv`, toCSV(t)]))), 'application/zip')
    log('completo', 'zip', f.sessions.length)
  }

  return (
    <div>
      <h1 className="mb-3 font-display text-2xl font-bold">Exportación de datos</h1>
      <Section title="Datos que se exportarán" description="Las exportaciones respetan los filtros activos e incluyen todas las filas (sin límite de paginación). Cada descarga queda registrada en la auditoría.">
        <ul className="list-disc pl-5 text-sm">
          <li><b>{f.sessions.length.toLocaleString('es-CR')}</b> sesiones (de {data.sessions.length.toLocaleString('es-CR')} cargadas) y <b>{f.decisions.length.toLocaleString('es-CR')}</b> decisiones.</li>
          <li>Versiones del instrumento: {versions.join(', ') || '—'}.</li>
          <li>Criterios: {describeFilters(filters)}.</li>
          <li>Fecha de extracción: {now.toLocaleString('es-CR')} (se guarda en UTC en la hoja «metadatos»).</li>
        </ul>
      </Section>
      <Section title="Libro completo">
        <div className="flex flex-wrap gap-2">
          <button onClick={xlsx} className="rounded-lg bg-u px-4 py-2 font-bold text-white">Excel (.xlsx) con todas las hojas</button>
          <button onClick={zip} className="rounded-lg border border-u px-4 py-2 font-bold text-u">Paquete .zip de CSV</button>
        </div>
        <p className="mt-2 text-xs text-muted">Hojas: participantes, decisiones, resumen, diccionario, metadatos.</p>
      </Section>
      <Section title="Archivos individuales (CSV para Excel)" description="UTF-8 con BOM, separador «;» y coma decimal (configuración regional de Costa Rica).">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => csv(sessionsTable(f.sessions))} className="rounded-lg border border-soft bg-white px-3 py-2 hover:bg-lav">Dataset por participante</button>
          <button onClick={() => csv(decisionsTable(f.decisions))} className="rounded-lg border border-soft bg-white px-3 py-2 hover:bg-lav">Dataset por decisión</button>
          <button onClick={() => csv(summaryTable(f.sessions, f.decisions))} className="rounded-lg border border-soft bg-white px-3 py-2 hover:bg-lav">Resumen agregado</button>
          <button onClick={() => csv(dictionaryTable())} className="rounded-lg border border-soft bg-white px-3 py-2 hover:bg-lav">Diccionario de variables</button>
          <button onClick={() => csv(meta)} className="rounded-lg border border-soft bg-white px-3 py-2 hover:bg-lav">Metadatos de extracción</button>
        </div>
      </Section>
    </div>
  )
}
