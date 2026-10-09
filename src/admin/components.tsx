import { useMemo, type ReactNode } from 'react'
import { useData } from './data'
import { DEFAULT_FILTERS, filterDecisions, filterSessions, type Filters } from '../analytics/metrics'
import { VERIFICA } from '../analytics/types'
import { fmtNum, fmtP, type TestResult } from '../analytics/stats'

export const PURPLE = '#442656', GOLD = '#C99A12', REAL = '#17834F', FAKE = '#C8322D', GREY = '#9C93A6'

export function useFiltered() {
  const { data, filters } = useData()
  return useMemo(() => {
    if (!data) return null
    const sessions = filterSessions(data.sessions, filters)
    const decisions = filterDecisions(data.decisions, sessions, filters)
    return { sessions, decisions }
  }, [data, filters])
}

const STATUSES: Filters['statuses'] = ['completada', 'en_curso', 'abandonada', 'excluida', 'prueba']

export function FilterBar() {
  const { data, filters, setFilters } = useData()
  const versions = useMemo(() => [...new Set(data?.sessions.map((s) => s.instrument_version) ?? [])].sort(), [data])
  const categories = useMemo(() => [...new Set(data?.decisions.map((d) => d.category) ?? [])].sort(), [data])
  const set = (p: Partial<Filters>) => setFilters({ ...filters, ...p })
  const changed = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS)
  return (
    <details className="mb-4 rounded-xl border border-black/5 bg-white p-3 shadow-sm" open={changed}>
      <summary className="cursor-pointer text-sm font-bold">Filtros {changed && <span className="ml-2 rounded-full bg-gold px-2 py-0.5 text-xs text-ink">activos</span>}</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Desde"><input type="date" value={filters.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} className="inp" /></Field>
        <Field label="Hasta"><input type="date" value={filters.to ?? ''} onChange={(e) => set({ to: e.target.value || undefined })} className="inp" /></Field>
        <Field label="Versión del instrumento"><Multi options={versions} value={filters.versions} onChange={(v) => set({ versions: v })} /></Field>
        <Field label="Estado de sesión"><Multi options={STATUSES} value={filters.statuses} onChange={(v) => set({ statuses: v as Filters['statuses'] })} /></Field>
        <Field label="Respuesta inicial: ¿verificas?"><Multi options={[...VERIFICA]} value={filters.verifica} onChange={(v) => set({ verifica: v })} /></Field>
        <Field label="Categoría de noticia"><Multi options={categories} value={filters.categories} onChange={(v) => set({ categories: v })} /></Field>
        <Field label="Uso de pistas (decisiones)">
          <select className="inp" value={filters.hint} onChange={(e) => set({ hint: e.target.value as Filters['hint'] })}>
            <option value="all">Todas</option><option value="with">Con lupa</option><option value="without">Sin lupa</option>
          </select>
        </Field>
        <Field label="Resultado de clasificación">
          <select className="inp" value={filters.outcome} onChange={(e) => set({ outcome: e.target.value as Filters['outcome'] })}>
            <option value="all">Todos</option><option value="correct">Aciertos</option><option value="error">Errores</option><option value="timeout">Tiempo agotado</option>
          </select>
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={filters.includeTest} onChange={(e) => set({ includeTest: e.target.checked })} /> Incluir datos de prueba</label>
        {changed && <button onClick={() => setFilters(DEFAULT_FILTERS)} className="text-u underline underline-offset-4">Limpiar filtros</button>}
        <span className="text-muted">Los filtros por categoría, lupa y resultado afectan solo a los análisis por decisión.</span>
      </div>
    </details>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-xs font-bold text-muted">{label}<div className="mt-1 font-normal text-ink">{children}</div></label>
}

function Multi({ options, value, onChange }: { options: readonly string[]; value: string[]; onChange: (v: string[]) => void }) {
  if (!options.length) return <span className="text-sm text-muted">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => {
        const on = value.includes(o)
        return <button type="button" key={o} aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
          className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-u bg-u text-white' : 'border-soft bg-white hover:border-u2'}`}>{o}</button>
      })}
    </div>
  )
}

export function Section({ title, children, description, actions }: { title: string; children: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <section className="mb-5 rounded-xl border border-black/5 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-bold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

export function Kpi({ label, value, sub, def }: { label: string; value: string; sub?: string; def: string }) {
  return (
    <div className="rounded-xl border border-black/5 bg-white p-4 shadow-sm">
      <div className="text-xs font-bold tracking-wide text-muted uppercase">{label}</div>
      <div className="mt-1 font-display text-3xl font-bold text-u tabular">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
      <details className="mt-1 text-xs text-muted"><summary className="cursor-pointer">Definición</summary><p className="mt-1">{def}</p></details>
    </div>
  )
}

export function Empty({ children = 'No hay datos con los filtros actuales.' }: { children?: ReactNode }) {
  return <p className="rounded-lg bg-lav/60 p-4 text-sm text-muted">{children}</p>
}

export function DataTable({ columns, rows, caption }: { columns: string[]; rows: ReactNode[][]; caption?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        {caption && <caption className="pb-2 text-left text-xs text-muted">{caption}</caption>}
        <thead><tr>{columns.map((c) => <th key={c} scope="col" className="border-b border-soft px-2 py-1.5 text-left font-bold whitespace-nowrap">{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="odd:bg-[#FBFAFC]">{r.map((c, j) => <td key={j} className="border-b border-black/5 px-2 py-1.5 align-top tabular">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

export function TestResultView({ r }: { r: TestResult }) {
  return (
    <div className="mt-3 rounded-lg border border-soft bg-[#FBFAFC] p-3 text-sm">
      <p><b>Método:</b> {r.method} · <b>N</b> = {r.n}</p>
      {r.assumptionsMet ? (
        <p className="mt-1">
          {r.statistic !== undefined && <>Estadístico = {fmtNum(r.statistic, 3)}{r.df !== undefined && <> (gl = {r.df})</>} · </>}
          p = {fmtP(r.p)}
          {r.effect && <> · {r.effect.name} = {fmtNum(r.effect.value, 3)} ({r.effect.label})</>}
        </p>
      ) : <p className="mt-1 text-amber-800">No se presenta prueba inferencial.</p>}
      {r.notes.map((n) => <p key={n} className="mt-1 text-muted">{n}</p>)}
      <p className="mt-1 text-xs text-muted">Datos observacionales: una asociación no demuestra causalidad. Muestra por autoselección; no generalizar a la población.</p>
    </div>
  )
}
