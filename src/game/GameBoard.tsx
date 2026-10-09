import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, friendlyMessage, type FeedbackT, type ItemT, type SessionPayloadT } from '../lib/api'
import { NewsCard, type CardHandle } from './NewsCard'
import { FeedbackSheet } from './FeedbackSheet'
import { Notice, Spinner } from './ui'

/** Llamadas al servidor que usa el tablero. El sandbox las reemplaza por una versión local que no guarda nada. */
export type BoardClient = Pick<typeof api, 'submitDecision' | 'useHint'>
type Props = { payload: SessionPayloadT; reducedMotion: boolean; onDone: () => void; client?: BoardClient }

/** Reputación cosmética (igual que el original; no se guarda ni se analiza). */
function reputation(decisions: FeedbackT[]) {
  let rep = 100
  for (const d of decisions) {
    if (d.is_correct) rep = Math.min(100, rep + 5)
    else rep = Math.max(0, rep - (d.is_real ? 10 : 20))
  }
  return rep
}

export function GameBoard({ payload, reducedMotion, onDone, client = api }: Props) {
  const total = payload.items.length
  const seconds = payload.config.seconds_per_item
  const [decisions, setDecisions] = useState<FeedbackT[]>(payload.decisions)
  const [hints, setHints] = useState<Record<string, string>>(payload.hints_used)
  const [hintsLeft, setHintsLeft] = useState(payload.hints_remaining)
  const [sheet, setSheet] = useState<FeedbackT | null>(null)
  const [saving, setSaving] = useState<{ retry: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hintBusy, setHintBusy] = useState(false)
  const [remaining, setRemaining] = useState(1)

  const position = decisions.length + 1
  const item: ItemT | undefined = payload.items[position - 1]
  const next: ItemT | undefined = payload.items[position]
  const score = decisions.length ? decisions[decisions.length - 1].total_score : 0
  const streak = decisions.length ? decisions[decisions.length - 1].streak ?? 0 : 0
  const rep = useMemo(() => reputation(decisions), [decisions])

  const t0 = useRef(0)
  const locked = useRef(false)
  const pendingDecision = useRef<{ choice: 'real' | 'falsa' | null; ms: number } | null>(null)
  const cardRef = useRef<CardHandle>(null)

  const send = useCallback(async () => {
    const pd = pendingDecision.current
    if (!pd) return
    setError(null)
    setSaving({ retry: 0 })
    try {
      const fb = await client.submitDecision(payload.session_id, position, pd.choice, pd.ms, { onRetry: (n) => setSaving({ retry: n }) })
      pendingDecision.current = null
      setSaving(null)
      setSheet(fb)
    } catch (e) {
      setSaving(null)
      setError(friendlyMessage(e))
    }
  }, [payload.session_id, position, client])

  const decide = useCallback((choice: 'real' | 'falsa' | null) => {
    if (locked.current || !item) return
    locked.current = true
    const ms = performance.now() - t0.current
    pendingDecision.current = { choice, ms: choice === null ? seconds * 1000 : ms }
    if (choice) cardRef.current?.fly(choice === 'real' ? 1 : -1)
    void send()
  }, [item, seconds, send])

  // Temporizador: siempre corre, aunque el usuario prefiera menos movimiento (corrige el original).
  useEffect(() => {
    if (!item || sheet) return
    locked.current = false
    t0.current = performance.now()
    setRemaining(1)
    const timeout = window.setTimeout(() => decide(null), seconds * 1000)
    const tick = window.setInterval(() => {
      if (locked.current) return
      setRemaining(Math.max(0, 1 - (performance.now() - t0.current) / 1000 / seconds))
    }, reducedMotion ? 1000 : 100)
    return () => { window.clearTimeout(timeout); window.clearInterval(tick) }
  }, [item, sheet, seconds, decide, reducedMotion])

  // Teclado: flechas izquierda/derecha
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sheet || locked.current) return
      if (e.key === 'ArrowRight') { e.preventDefault(); decide('real') }
      if (e.key === 'ArrowLeft') { e.preventDefault(); decide('falsa') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [decide, sheet])

  const useHint = async () => {
    if (!item || hintBusy || locked.current || hints[String(position)] || hintsLeft <= 0) return
    setHintBusy(true)
    try {
      const r = await client.useHint(payload.session_id, position)
      setHints((h) => ({ ...h, [String(position)]: r.hint }))
      setHintsLeft(r.hints_remaining)
    } catch (e) {
      setError(friendlyMessage(e))
    } finally {
      setHintBusy(false)
    }
  }

  const goNext = () => {
    if (!sheet) return
    setDecisions((d) => [...d, sheet])
    setSheet(null)
    if (position >= total) onDone()
  }

  if (!item) return null
  const hintText = hints[String(position)]
  const timerColor = remaining < 0.25 ? 'bg-fake-bright' : 'bg-gold'

  return (
    <section aria-label="Juego" className="mx-auto flex min-h-dvh max-w-[520px] flex-col overflow-x-clip">
      <div className="flex items-center gap-3 px-4 pt-3 pb-2">
        <div aria-live="polite" className="font-display text-3xl leading-none font-extrabold tabular">
          {score}<small className="block font-body text-xs font-normal text-[#CFC3DA]">puntos</small>
        </div>
        {streak >= 2 && <span key={streak} className="anim-pop rounded-lg bg-gold px-2 py-0.5 font-display font-extrabold text-ink">🔥 x{Math.min(streak, 4)}</span>}
        <div className="ml-auto text-right">
          <div className="text-[22px] tracking-widest" aria-label={`Lupas disponibles: ${hintsLeft}`}>
            {'🔍'.repeat(hintsLeft)}{'◌'.repeat(Math.max(0, payload.config.hints_per_session - hintsLeft))}
          </div>
          <div className="text-sm text-[#CFC3DA]" aria-live="polite">Noticia {position} de {total}</div>
        </div>
      </div>

      <div className="mx-4 h-2 overflow-hidden rounded bg-white/15" role="progressbar" aria-label="Progreso" aria-valuemin={0} aria-valuemax={total} aria-valuenow={decisions.length}>
        <i className="block h-full bg-white/70 transition-[width]" style={{ width: `${(decisions.length / total) * 100}%` }} />
      </div>
      <div className="mx-4 mt-2 flex items-center justify-between text-xs text-[#CFC3DA]">
        <span>Tu credibilidad</span>
        <span className="flex items-center gap-2"><span className="inline-block h-1.5 w-24 overflow-hidden rounded bg-white/15"><i className="block h-full transition-[width]" style={{ width: `${rep}%`, background: rep > 60 ? 'var(--color-real-bright)' : rep > 30 ? 'var(--color-gold)' : 'var(--color-fake-bright)' }} /></span>{rep}%</span>
      </div>

      <div className="relative mx-4 mt-3 min-h-[400px] flex-1">
        {next && <NewsCard item={next} back />}
        <NewsCard key={item.item_id} ref={cardRef} item={item} hint={hintText} disabled={locked.current || !!sheet} onSwipe={(d) => decide(d > 0 ? 'real' : 'falsa')} />
      </div>

      <div className="mx-4 mt-3 h-1.5 overflow-hidden rounded bg-white/15" role="timer" aria-label={`Tiempo restante: ${Math.ceil(remaining * seconds)} segundos`}>
        <i className={`block h-full ${timerColor}`} style={{ width: `${remaining * 100}%` }} />
      </div>
      <p className="sr-only" aria-live="polite">{remaining < 0.25 && remaining > 0 ? 'Quedan pocos segundos' : ''}</p>

      <div className="px-4 pt-2">
        {saving && <Notice><Spinner label={saving.retry ? `Sin conexión. Reintentando (${saving.retry})…` : 'Guardando tu respuesta…'} /></Notice>}
        {error && (
          <Notice kind="error" action={pendingDecision.current ? <button className="rounded-xl bg-white px-4 py-2 font-bold text-ink" onClick={() => void send()}>Reintentar</button> : null}>
            {error}
          </Notice>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom,0px))]">
        <button className="btn-3d-fake min-h-16 rounded-2xl bg-fake px-2 py-3 font-display text-lg font-extrabold text-white disabled:opacity-50" onClick={() => decide('falsa')} disabled={!!saving || !!sheet}>
          👈 Falsa<small className="block font-body text-xs font-normal opacity-95">No la reenvío</small>
        </button>
        <button className="h-16 w-16 rounded-full border-[3px] border-gold bg-u text-2xl disabled:opacity-30" aria-label={hintText ? 'Pista ya revelada' : `Usar lupa para investigar (${hintsLeft} disponibles)`} onClick={() => void useHint()} disabled={hintsLeft <= 0 || !!hintText || hintBusy || !!saving || !!sheet}>
          🔍
        </button>
        <button className="btn-3d-real min-h-16 rounded-2xl bg-real px-2 py-3 font-display text-lg font-extrabold text-white disabled:opacity-50" onClick={() => decide('real')} disabled={!!saving || !!sheet}>
          Real 👉<small className="block font-body text-xs font-normal opacity-95">La reenvío</small>
        </button>
      </div>
      <p className="-mt-2 pb-3 text-center text-[13px] text-[#CFC3DA]">Desliza la tarjeta o usa los botones (también ← →)</p>

      {sheet && <FeedbackSheet fb={sheet} isLast={position >= total} onNext={goNext} reducedMotion={reducedMotion} />}
    </section>
  )
}
