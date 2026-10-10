import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useData, type StudyRow } from '../data'
import { Section } from '../components'
import { friendlyError, loadBank, loadVersionItems, nextVersion, type BankCard, type VersionItem } from '../cards'
import { Thumb } from '../Thumb'

const STATUS: Record<string, [string, string]> = {
  active: ['En juego', 'bg-real text-white'], draft: ['Borrador', 'bg-gold text-ink'], closed: ['Cerrada', 'bg-soft text-ink'], archived: ['Descartada', 'bg-black/10 text-muted'],
}
const byVersion = (a: StudyRow, b: StudyRow) => {
  const x = a.version.split('.').map(Number), y = b.version.split('.').map(Number)
  return y[0] - x[0] || y[1] - x[1] || y[2] - x[2]
}

export default function Versions() {
  const { data, profile, reload } = useData()
  const canEdit = profile.role !== 'viewer'
  const isOwner = profile.role === 'owner'
  const [bank, setBank] = useState<BankCard[] | null>(null)
  const [items, setItems] = useState<VersionItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [building, setBuilding] = useState(false)
  const [confirming, setConfirming] = useState<StudyRow | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [b, i] = await Promise.all([loadBank(), loadVersionItems()])
      setBank(b); setItems(i); setError(null)
    } catch {
      setError('No se pudieron cargar las versiones. Si acabas de actualizar la plataforma, falta aplicar la migración del banco en Supabase.')
    }
  }, [])
  useEffect(() => { void load() }, [load])

  const studies = useMemo(() => [...(data?.studies ?? [])].sort(byVersion), [data])
  const active = studies.find((s) => s.status === 'active')
  const sessionsBy = useMemo(() => new Map(Object.entries(data?.sessionCounts ?? {})), [data])

  const refresh = async () => { await Promise.all([reload(), load()]) }

  const activate = async (s: StudyRow) => {
    const { data: r, error } = await supabase().rpc('activate_study_version', { p_study_id: s.id })
    setConfirming(null)
    if (error) { setMsg(friendlyError(error.message)); return }
    const res = r as { active: string; previous: string | null }
    setMsg(`Listo: los jugadores nuevos ya juegan la ${res.active}.${res.previous ? ` La ${res.previous} quedó cerrada y sus datos se conservan.` : ''}`)
    await refresh()
  }
  const discard = async (s: StudyRow) => {
    if (!confirm(`¿Descartar el borrador ${s.version}? Nadie lo ha jugado; queda en el historial como descartado.`)) return
    const { error } = await supabase().rpc('archive_study_draft', { p_study_id: s.id })
    setMsg(error ? friendlyError(error.message) : `Borrador ${s.version} descartado.`)
    await refresh()
  }

  if (building && bank && active) {
    return <Builder bank={bank} activeItems={items.filter((i) => i.study_id === active.id)} active={active} versions={studies.map((s) => s.version)}
      onCancel={() => setBuilding(false)}
      onCreated={async (v) => { setBuilding(false); setMsg(`Borrador ${v} creado. Revísalo abajo y actívalo cuando esté listo.`); await refresh() }} />
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="flex-1 font-display text-2xl font-bold">Versiones del juego</h1>
        {canEdit && bank && active && <button onClick={() => { setMsg(null); setBuilding(true) }} className="rounded-lg bg-u px-4 py-2 font-bold text-white hover:bg-u2">+ Armar versión nueva</button>}
      </div>
      {msg && <p role="status" className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-900">{msg}</p>}
      {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {confirming && (
        <div role="alertdialog" aria-labelledby="confirm-t" className="mb-4 rounded-xl border-2 border-u bg-white p-4 shadow-sm">
          <h2 id="confirm-t" className="font-display text-lg font-bold">¿Activar la versión {confirming.version}?</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            <li>Desde ahora, quien abra el juego jugará la <b>{confirming.version}</b>.</li>
            {active && <li>La <b>{active.version}</b> queda cerrada. Sus datos se conservan y se pueden filtrar por versión.</li>}
            <li>Quien esté jugando en este momento termina su partida con la versión con la que empezó.</li>
            <li>Si algo sale mal, puedes volver a activar la {active?.version ?? 'anterior'} desde esta misma pantalla.</li>
          </ul>
          <div className="mt-3 flex gap-2">
            <button onClick={() => void activate(confirming)} className="rounded-lg bg-u px-4 py-2 font-bold text-white">Sí, activar {confirming.version}</button>
            <button onClick={() => setConfirming(null)} className="rounded-lg border border-soft px-4 py-2">Cancelar</button>
          </div>
        </div>
      )}

      <Section title="Historial" description="Cada versión guarda sus propias noticias. La que está «En juego» no se edita: los cambios van en una versión nueva, así los datos de cada versión siguen siendo comparables.">
        <ul className="divide-y divide-black/5">
          {studies.map((s) => {
            const its = items.filter((i) => i.study_id === s.id)
            const reales = its.filter((i) => i.is_real).length
            const [label, cls] = STATUS[s.status] ?? [s.status, 'bg-soft']
            const canActivate = isOwner && (s.status === 'draft' || s.status === 'closed') && s.version !== '1.0.0' && its.length > 0
            return (
              <li key={s.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="font-display text-lg">{s.version}</b>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${cls}`}>{label}</span>
                  <span className="text-sm">{s.title}</span>
                  {(s.config as { leaderboard?: boolean }).leaderboard && <span className="rounded-full bg-lav px-2 py-0.5 text-xs">🏆 con ranking</span>}
                  <span className="ml-auto flex flex-wrap gap-3 text-sm">
                    {its.length > 0 && <button aria-expanded={open === s.id} onClick={() => setOpen(open === s.id ? null : s.id)} className="text-u underline underline-offset-4">{open === s.id ? 'Ocultar noticias' : 'Ver noticias'}</button>}
                    {canActivate && <button onClick={() => { setMsg(null); setConfirming(s) }} className="font-bold text-u underline underline-offset-4">{s.status === 'draft' ? 'Activar' : 'Volver a activar'}</button>}
                    {canEdit && s.status === 'draft' && <button onClick={() => void discard(s)} className="text-muted underline underline-offset-4">Descartar</button>}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {its.length ? `${its.length} noticias (${reales} reales, ${its.length - reales} falsas)` : 'Sin noticias en el catálogo'} · {(sessionsBy.get(s.version) ?? 0).toLocaleString('es-CR')} sesiones
                  {s.changelog && <> · {s.changelog}</>}
                </p>
                {open === s.id && (
                  <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                    {its.map((i) => (
                      <li key={i.id} className="flex items-center gap-2 rounded-lg bg-[#FBFAFC] p-2 text-sm">
                        <Thumb display={i.display} size={44} />
                        <span className="min-w-0 flex-1 leading-snug">{i.headline}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold text-white ${i.is_real ? 'bg-real' : 'bg-fake'}`}>{i.is_real ? 'Real' : 'Falsa'}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
        {!isOwner && <p className="mt-2 text-xs text-muted">Solo una cuenta con rol owner puede activar versiones.</p>}
      </Section>
    </div>
  )
}

function Builder({ bank, activeItems, active, versions, onCancel, onCreated }: {
  bank: BankCard[]; activeItems: VersionItem[]; active: StudyRow; versions: string[]
  onCancel: () => void; onCreated: (v: string) => Promise<void>
}) {
  const available = bank.filter((c) => !c.archived)
  const [picked, setPicked] = useState<Set<string>>(() => new Set(available.filter((c) => activeItems.some((i) => i.item_key === c.item_key)).map((c) => c.id)))
  const [version, setVersion] = useState(() => nextVersion(versions))
  const [title, setTitle] = useState(active.title)
  const [note, setNote] = useState('')
  const [leaderboard, setLeaderboard] = useState(() => Boolean((active.config as { leaderboard?: boolean }).leaderboard))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const min = Number((active.config as { items_per_session?: number }).items_per_session ?? 10)
  const sel = available.filter((c) => picked.has(c.id))
  const reales = sel.filter((c) => c.is_real).length
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const tooFew = sel.length < min

  const create = async () => {
    setError(null); setBusy(true)
    const { data, error } = await supabase().rpc('create_study_version', { p_version: version.trim(), p_title: title, p_changelog: note, p_card_ids: [...picked] })
    if (error) { setBusy(false); setError(friendlyError(error.message)); return }
    const created = data as { id: string; version: string }
    const lb = await supabase().rpc('set_draft_leaderboard', { p_study_id: created.id, p_enabled: leaderboard })
    setBusy(false)
    if (lb.error) { setError(`Se creó el borrador ${created.version}, pero no se pudo guardar la opción de la tabla. Descártalo y vuelve a intentarlo.`); return }
    await onCreated(created.version)
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button onClick={onCancel} className="rounded-md border border-soft bg-white px-3 py-1 text-sm hover:bg-lav">← Volver</button>
        <h1 className="font-display text-2xl font-bold">Armar versión nueva</h1>
      </div>
      <Section title="1. Elige las noticias" description={`Vienen marcadas las de la versión en juego (${active.version}). Las preguntas de opinión, el tiempo, las pistas y el puntaje se copian de esa versión.`}>
        <p className={`mb-2 rounded-lg p-2.5 text-sm ${tooFew ? 'bg-red-50 text-red-800' : 'bg-lav/60'}`} role="status">
          <b>{sel.length} elegidas</b>: {reales} reales y {sel.length - reales} falsas.{' '}
          {tooFew ? `Hacen falta al menos ${min}.` : sel.length > min ? `Cada jugador verá ${min} al azar de estas ${sel.length}, así que la cantidad de reales y falsas puede variar entre jugadores.` : `Cada jugador verá las ${min}, en orden aleatorio.`}
        </p>
        <ul className="divide-y divide-black/5">
          {available.map((c) => {
            const a = activeItems.find((i) => i.item_key === c.item_key)
            return (
              <li key={c.id}>
                <label className="flex cursor-pointer items-center gap-3 py-2">
                  <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} className="h-5 w-5" />
                  <Thumb display={c.display} size={44} />
                  <span className="min-w-0 flex-1 text-sm leading-snug">{c.headline}
                    {a && a.item_version !== c.revision && a.bank_id === c.id && <span className="ml-1 rounded-full bg-[#FFF6D6] px-2 py-0.5 text-xs">editada</span>}
                    {!a && <span className="ml-1 rounded-full bg-lav px-2 py-0.5 text-xs">nueva</span>}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold text-white ${c.is_real ? 'bg-real' : 'bg-fake'}`}>{c.is_real ? 'Real' : 'Falsa'}</span>
                </label>
              </li>
            )
          })}
        </ul>
      </Section>
      <Section title="2. Nombra la versión">
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <label className="text-xs font-bold text-muted">Número<input className="inp mt-1 font-normal text-ink" value={version} onChange={(e) => setVersion(e.target.value)} /></label>
          <label className="text-xs font-bold text-muted">Título<input className="inp mt-1 font-normal text-ink" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        </div>
        <label className="mt-3 block text-xs font-bold text-muted">Qué cambia respecto de la {active.version} (queda en el registro)
          <textarea className="inp mt-1 font-normal text-ink" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: se agrega la noticia del peaje y se cambia la imagen del bus." />
        </label>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={leaderboard} onChange={(e) => setLeaderboard(e.target.checked)} className="mt-0.5 h-4 w-4" />
          <span><b>Ranking de puntuación</b> al final de la partida. Es opcional para el jugador y usa apodos de una lista, sin nombres. Puede cambiar cómo juega la gente, por eso va en la versión.</span>
        </label>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <div className="mt-3 flex gap-2">
          <button disabled={busy || tooFew} onClick={() => void create()} className="rounded-lg bg-u px-5 py-2 font-bold text-white hover:bg-u2 disabled:opacity-50">{busy ? 'Creando…' : 'Crear borrador'}</button>
          <button onClick={onCancel} className="rounded-lg border border-soft bg-white px-4 py-2">Cancelar</button>
        </div>
        <p className="mt-2 text-xs text-muted">El borrador no lo ve ningún jugador hasta que alguien con rol owner lo active.</p>
      </Section>
    </div>
  )
}
