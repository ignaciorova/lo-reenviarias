import { useMemo, useState } from 'react'
import { useData } from '../data'
import { Section, Empty } from '../components'
import { StatusPill } from './Explorer'
import { supabase } from '../../lib/supabase'
import { median } from '../../analytics/stats'
import type { SessionRow } from '../../analytics/types'

type Flag = { session: SessionRow; reasons: string[] }

export default function Quality() {
  const { data, reload, profile } = useData()
  const [msg, setMsg] = useState<string | null>(null)
  const canEdit = profile.role !== 'viewer'

  const { flags, summary } = useMemo(() => {
    if (!data) return { flags: [] as Flag[], summary: null }
    const byS = new Map<string, typeof data.decisions>()
    for (const d of data.decisions) byS.set(d.session_id, [...(byS.get(d.session_id) ?? []), d])
    const flags = new Map<string, string[]>()
    const add = (id: string, r: string) => flags.set(id, [...(flags.get(id) ?? []), r])
    for (const s of data.sessions) {
      const ds = byS.get(s.session_id) ?? []
      if (s.status === 'completed' && ds.length >= 10) {
        const ms = ds.filter((d) => !d.timed_out && d.response_ms !== null).map((d) => d.response_ms as number)
        if (ms.length >= 5 && median(ms) < 1500) add(s.session_id, `Respuestas muy rápidas (mediana ${(median(ms) / 1000).toFixed(1)} s)`)
        const choices = new Set(ds.map((d) => d.choice ?? 'sin tiempo'))
        if (choices.size === 1) add(s.session_id, `Todas las respuestas iguales («${[...choices][0]}»)`)
        const to = ds.filter((d) => d.timed_out).length
        if (to >= 5) add(s.session_id, `${to} tiempos agotados`)
      }
      if (s.status === 'completed' && ds.length !== 10 && s.origin === 'app') add(s.session_id, `Completada con ${ds.length} decisiones`)
      if (s.origin === 'legacy_import' && ds.length !== 10) add(s.session_id, `Histórica con ${ds.length} decisiones (se esperaban 10)`)
    }
    // Posibles duplicados del sistema original (doble clic en "Ver mi resultado")
    const legacy = data.sessions.filter((s) => s.origin === 'legacy_import').sort((a, b) => a.started_at.localeCompare(b.started_at))
    for (let i = 1; i < legacy.length; i++) {
      const a = legacy[i - 1], b = legacy[i]
      const same = a.opinion === b.opinion && a.verifica === b.verifica && a.post_cambio === b.post_cambio && a.correct_count === b.correct_count
      const close = Math.abs(new Date(b.completed_at ?? b.started_at).getTime() - new Date(a.completed_at ?? a.started_at).getTime()) < 10 * 60 * 1000
      if (same && close) add(b.session_id, 'Posible duplicado de la fila anterior (sistema original)')
    }
    const list = [...flags.entries()].map(([id, reasons]) => ({ session: data.sessions.find((s) => s.session_id === id)!, reasons }))
    const s = data.sessions
    return {
      flags: list,
      summary: {
        total: s.length, valid: s.filter((x) => x.is_valid).length, enCurso: s.filter((x) => x.status_effective === 'en_curso').length,
        abandonadas: s.filter((x) => x.status_effective === 'abandonada').length, excluidas: s.filter((x) => x.status_effective === 'excluida').length,
        prueba: s.filter((x) => x.is_test).length, legacy: s.filter((x) => x.origin === 'legacy_import').length, sinConsent: s.filter((x) => !x.consent_accepted && x.origin === 'app').length,
      },
    }
  }, [data])
  if (!data || !summary) return null

  const setFlags = async (id: string, isTest: boolean | null, reason: string | null) => {
    setMsg(null)
    const { error } = await supabase().rpc('set_session_flags', { p_session_id: id, p_is_test: isTest, p_exclusion_reason: reason })
    if (error) setMsg('No se pudo actualizar la sesión.'); else { setMsg('Sesión actualizada.'); void reload() }
  }
  const markAbandoned = async () => {
    const { data: n, error } = await supabase().rpc('mark_abandoned_sessions', { p_older_than_hours: 24 })
    setMsg(error ? 'No se pudo actualizar.' : `${n} sesiones marcadas como abandonadas.`)
    void reload()
  }
  const purge = async (scope: 'test' | 'incomplete', days: number) => {
    const what = scope === 'test' ? 'las sesiones de PRUEBA' : 'las sesiones NO completadas'
    if (!confirm(`Se eliminarán definitivamente ${what} con más de ${days} días. Esta acción no se puede deshacer y queda en la auditoría. ¿Continuar?`)) return
    setMsg(null)
    const { data: n, error } = await supabase().rpc('purge_sessions', { p_scope: scope, p_older_than_days: days })
    setMsg(error ? 'No se pudo depurar (¿está instalada la función purge_sessions?).' : `${n} sesiones eliminadas.`)
    void reload()
  }

  return (
    <div>
      <h1 className="mb-3 font-display text-2xl font-bold">Control de calidad de datos</h1>
      {msg && <p role="status" className="mb-3 rounded-lg bg-lav p-3 text-sm">{msg}</p>}
      <Section title="Estado de la base" description="Sin aplicar filtros.">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {Object.entries({ 'Sesiones totales': summary.total, Válidas: summary.valid, 'En curso (< 24 h)': summary.enCurso, Abandonadas: summary.abandonadas, Excluidas: summary.excluidas, 'De prueba': summary.prueba, 'Históricas (v1.0.0)': summary.legacy, 'Sin aceptación (app)': summary.sinConsent })
            .map(([k, v]) => <div key={k} className="rounded-lg bg-[#FBFAFC] p-3"><dt className="text-muted">{k}</dt><dd className="font-display text-2xl font-bold tabular">{v}</dd></div>)}
        </dl>
        {canEdit && <button onClick={() => void markAbandoned()} className="mt-3 rounded-lg border border-soft bg-white px-3 py-1.5 text-sm hover:bg-lav">Marcar como abandonadas las sesiones sin terminar de más de 24 h</button>}
      </Section>
      <Section title={`Sesiones con alertas (${flags.length})`} description="Las alertas son heurísticas: revisa cada caso antes de excluirlo y documenta el motivo. Excluir no borra datos; los saca de los indicadores «válidos».">
        {!flags.length ? <Empty>No se detectaron patrones sospechosos.</Empty> : (
          <ul className="divide-y divide-black/5">
            {flags.map(({ session: s, reasons }) => (
              <li key={s.session_id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <StatusPill s={s} />
                <span className="font-mono text-xs">{s.session_id.slice(0, 8)}</span>
                <span className="text-muted">{new Date(s.started_at).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                <span className="flex-1">{reasons.join(' · ')}</span>
                {canEdit && (
                  <span className="flex gap-1">
                    {s.exclusion_reason ? <button onClick={() => void setFlags(s.session_id, null, null)} className="rounded border border-soft px-2 py-0.5">Reincluir</button>
                      : <button onClick={() => { const r = prompt('Motivo de exclusión (se guarda en la auditoría):', reasons[0]); if (r) void setFlags(s.session_id, null, r) }} className="rounded border border-soft px-2 py-0.5">Excluir…</button>}
                    <button onClick={() => void setFlags(s.session_id, !s.is_test, s.exclusion_reason)} className="rounded border border-soft px-2 py-0.5">{s.is_test ? 'No es prueba' : 'Marcar prueba'}</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
      {profile.role === 'owner' && (
        <Section title="Conservación de datos" description="Política documentada en privacidad-y-conservacion.md. Las sesiones completadas no se eliminan desde aquí.">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void purge('test', 1)} className="rounded-lg border border-fake px-3 py-2 text-sm font-bold text-fake">Eliminar sesiones de prueba (&gt; 1 día)</button>
            <button onClick={() => void purge('incomplete', 30)} className="rounded-lg border border-fake px-3 py-2 text-sm font-bold text-fake">Eliminar sesiones no completadas (&gt; 30 días)</button>
          </div>
        </Section>
      )}
    </div>
  )
}
