import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { friendlyMessage } from '../../lib/api'
import { apiV4, type ActionT, type BeliefT, type CardFeedbackT, type CardInput, type EvaluationT, type FinalActionT, type ItemV4T, type OpenedSourceT, type SessionV4T, type SourceKindT } from '../../lib/apiV4'
import { NewsCard, type CardHandle } from '../NewsCard'
import { Notice, Spinner } from '../ui'
import { FeedbackV4 } from './FeedbackV4'
import { BELIEF_LABEL, EVAL_LABEL, REASONS, SOURCE_KIND, WARNING_TEXT } from './text'

type Props = { payload: SessionV4T; reducedMotion: boolean; onDone: () => void }

/**
 * Una noticia, en este orden:
 *   decide  → Reenviar · No reenviar · Reenviar con aviso · Verificar primero (20 s)
 *   sources → elegir fuente (si verifica; el tiempo de verificación corre aparte)
 *   reading → leer el extracto y decir qué dice
 *   final   → decisión final después de verificar
 *   belief  → «¿Te la crees?» Sí / No / No sé (sin tiempo)
 *   why     → «¿Por qué?» (solo en 2 noticias al azar, opcional)
 * Al final se envía todo junto; el servidor calcula el estado (E1..E7) y los puntos.
 */
type Phase = 'decide' | 'sources' | 'reading' | 'final' | 'belief' | 'why'

type Draft = {
  first?: ActionT | null
  firstMs?: number
  kind?: SourceKindT | null
  readMs?: number | null
  evaluation?: EvaluationT | null
  final?: FinalActionT | null
  verifyTimedOut?: boolean
}

// Si se recarga la página a mitad de una verificación, se retoma ahí (las aperturas ya quedaron en el servidor).
const progressKey = (sid: string, pos: number) => `lr_v4_card_${sid}_${pos}`
const saveProgress = (sid: string, pos: number, d: Draft) => { try { sessionStorage.setItem(progressKey(sid, pos), JSON.stringify(d)) } catch { /* noop */ } }
const loadProgress = (sid: string, pos: number): Draft | null => { try { const v = sessionStorage.getItem(progressKey(sid, pos)); return v ? JSON.parse(v) as Draft : null } catch { return null } }
const clearProgress = (sid: string, pos: number) => { try { sessionStorage.removeItem(progressKey(sid, pos)) } catch { /* noop */ } }

export function BoardV4({ payload, reducedMotion, onDone }: Props) {
  const sid = payload.session_id
  const total = payload.items.length
  const seconds = payload.config.seconds_per_item
  const verifySeconds = payload.config.verify_seconds
  const [cards, setCards] = useState<CardFeedbackT[]>(payload.cards)
  const position = cards.length + 1
  const item: ItemV4T | undefined = payload.items[position - 1]
  const next: ItemV4T | undefined = payload.items[position]
  const score = cards.length ? cards[cards.length - 1].total_score : payload.config.start_points

  const [phase, setPhase] = useState<Phase>('decide')
  const [remaining, setRemaining] = useState(1)
  const [verifyLeft, setVerifyLeft] = useState(1)
  const [source, setSource] = useState<OpenedSourceT | null>(null)
  const [opening, setOpening] = useState<SourceKindT | null>(null)
  const [belief, setBelief] = useState<BeliefT | null>(null)
  const [sheet, setSheet] = useState<CardFeedbackT | null>(null)
  const [saving, setSaving] = useState<{ retry: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const draft = useRef<Draft>({})
  const t0 = useRef(0)
  const readStart = useRef(0)
  const locked = useRef(false)
  const pending = useRef<CardInput | null>(null)
  const cardRef = useRef<CardHandle>(null)

  // Nueva noticia: reinicia todo (o retoma una verificación interrumpida por una recarga)
  useEffect(() => {
    if (!item) return
    const saved = loadProgress(sid, position)
    draft.current = saved ?? {}
    setSource(null); setBelief(null); setError(null)
    locked.current = false
    if (saved?.first === 'verificar' && !saved.verifyTimedOut) {
      setPhase(saved.final ? 'belief' : saved.evaluation ? 'final' : 'sources')
    } else if (saved?.first) {
      setPhase('belief')
    } else {
      setPhase('decide')
    }
  }, [item, sid, position])

  const send = useCallback(async () => {
    const card = pending.current
    if (!card) return
    setError(null)
    setSaving({ retry: 0 })
    try {
      const fb = await apiV4.submitCard(sid, position, card, { onRetry: (n) => setSaving({ retry: n }) })
      pending.current = null
      clearProgress(sid, position)
      setSaving(null)
      setSheet(fb)
    } catch (e) {
      setSaving(null)
      setError(friendlyMessage(e))
    }
  }, [sid, position])

  const finish = useCallback((b: BeliefT | null, reason: string | null) => {
    if (pending.current) return  // ya se está enviando esta noticia
    const d = draft.current
    pending.current = {
      first_action: d.first ?? null,
      first_action_ms: Math.round(d.firstMs ?? seconds * 1000),
      source_kind: d.kind ?? null,
      read_ms: d.readMs != null ? Math.round(d.readMs) : null,
      evaluation: d.evaluation ?? null,
      final_action: d.final ?? null,
      verify_timed_out: !!d.verifyTimedOut,
      belief: b,
      reason,
    }
    void send()
  }, [seconds, send])

  // Primera decisión
  const act = useCallback((a: ActionT | null) => {
    if (locked.current || !item || phase !== 'decide') return
    locked.current = true
    const ms = a === null ? seconds * 1000 : performance.now() - t0.current
    draft.current = { first: a, firstMs: ms }
    if (a === null) { finish(null, null); return }  // tiempo agotado: E7, pasa a la siguiente
    saveProgress(sid, position, draft.current)
    // Reenviar con aviso también es reenviar: la tarjeta sale hacia la derecha
    if (a === 'reenviar' || a === 'reenviar_aviso') cardRef.current?.fly(1)
    if (a === 'no_reenviar') cardRef.current?.fly(-1)
    window.setTimeout(() => { locked.current = false; setPhase(a === 'verificar' ? 'sources' : 'belief') }, a === 'verificar' ? 0 : 260)
  }, [item, phase, seconds, finish, sid, position])

  // Temporizador de la primera decisión (corre aunque se prefiera menos movimiento)
  useEffect(() => {
    if (!item || phase !== 'decide' || sheet) return
    t0.current = performance.now()
    setRemaining(1)
    const timeout = window.setTimeout(() => act(null), seconds * 1000)
    const tick = window.setInterval(() => setRemaining(Math.max(0, 1 - (performance.now() - t0.current) / 1000 / seconds)), reducedMotion ? 1000 : 100)
    return () => { window.clearTimeout(timeout); window.clearInterval(tick) }
  }, [item, phase, sheet, seconds, act, reducedMotion])

  // Temporizador de la verificación (fuente → lectura → decisión final)
  const verifyT0 = useRef(0)
  const inVerify = phase === 'sources' || phase === 'reading' || phase === 'final'
  useEffect(() => {
    if (!inVerify || sheet) return
    if (!verifyT0.current) verifyT0.current = performance.now()
    const left = () => Math.max(0, 1 - (performance.now() - verifyT0.current) / 1000 / verifySeconds)
    setVerifyLeft(left())
    const tick = window.setInterval(() => {
      const l = left()
      setVerifyLeft(l)
      if (l <= 0) {
        window.clearInterval(tick)
        draft.current = { ...draft.current, verifyTimedOut: true }
        finish(null, null)
      }
    }, 250)
    return () => window.clearInterval(tick)
  }, [inVerify, sheet, verifySeconds, finish])
  useEffect(() => { if (!inVerify) verifyT0.current = 0 }, [inVerify])

  // Teclado en la primera decisión: → reenviar, ← no reenviar, V verificar, A con aviso
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== 'decide' || sheet || locked.current) return
      if (e.key === 'ArrowRight') { e.preventDefault(); act('reenviar') }
      if (e.key === 'ArrowLeft') { e.preventDefault(); act('no_reenviar') }
      if (e.key === 'v' || e.key === 'V') act('verificar')
      if (e.key === 'a' || e.key === 'A') act('reenviar_aviso')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, sheet, act])

  const open = async (kind: SourceKindT) => {
    if (opening) return
    setOpening(kind); setError(null)
    try {
      const s = await apiV4.openSource(sid, position, kind)
      draft.current = { ...draft.current, kind, readMs: null, evaluation: null }
      saveProgress(sid, position, draft.current)
      setSource(s)
      readStart.current = performance.now()
      setPhase('reading')
    } catch (e) {
      setError(friendlyMessage(e))
    } finally { setOpening(null) }
  }

  const evaluate = (ev: EvaluationT) => {
    draft.current = { ...draft.current, evaluation: ev, readMs: performance.now() - readStart.current }
    saveProgress(sid, position, draft.current)
    setPhase('final')
  }

  const decideFinal = (a: FinalActionT) => {
    draft.current = { ...draft.current, final: a }
    saveProgress(sid, position, draft.current)
    setPhase('belief')
  }

  const chooseBelief = (b: BeliefT) => {
    setBelief(b)
    if (item?.ask_why) setPhase('why')
    else finish(b, null)
  }

  const goNext = () => {
    if (!sheet) return
    setCards((c) => [...c, sheet])
    setSheet(null)
    setPhase('decide')
    if (position >= total) onDone()
  }

  if (!item) return null
  const timerColor = remaining < 0.25 ? 'bg-fake-bright' : 'bg-gold'
  const busy = !!saving

  return (
    <section aria-label="Juego" className="mx-auto flex min-h-dvh max-w-[520px] flex-col overflow-x-clip">
      <div className="flex items-center gap-3 px-4 pt-3 pb-2">
        <div aria-live="polite" className="font-display text-3xl leading-none font-extrabold tabular">
          {score}<small className="block font-body text-xs font-normal text-[#CFC3DA]">puntos</small>
        </div>
        <div className="ml-auto text-right text-sm text-[#CFC3DA]" aria-live="polite">Noticia {position} de {total}</div>
      </div>
      <div className="mx-4 h-2 overflow-hidden rounded bg-white/15" role="progressbar" aria-label="Progreso" aria-valuemin={0} aria-valuemax={total} aria-valuenow={cards.length}>
        <i className="block h-full bg-white/70 transition-[width]" style={{ width: `${(cards.length / total) * 100}%` }} />
      </div>

      <div className="relative mx-4 mt-3 min-h-[380px] flex-1">
        {next && <NewsCard item={next} back />}
        <NewsCard key={item.item_id} ref={cardRef} item={item} labels={{ right: 'REENVIAR', left: 'NO' }}
          disabled={phase !== 'decide' || busy || !!sheet} onSwipe={(d) => act(d > 0 ? 'reenviar' : 'no_reenviar')} />
      </div>

      {phase === 'decide' && (
        <>
          <div className="mx-4 mt-3 h-1.5 overflow-hidden rounded bg-white/15" role="timer" aria-label={`Tiempo restante: ${Math.ceil(remaining * seconds)} segundos`}>
            <i className={`block h-full ${timerColor}`} style={{ width: `${remaining * 100}%` }} />
          </div>
          <p className="sr-only" aria-live="polite">{remaining < 0.25 && remaining > 0 ? 'Quedan pocos segundos' : ''}</p>
          <div className="grid grid-cols-2 gap-2.5 px-4 pt-3">
            <button className="btn-3d-fake min-h-14 rounded-2xl bg-fake px-2 py-2.5 font-display text-lg font-extrabold text-white disabled:opacity-50" onClick={() => act('no_reenviar')} disabled={busy}>
              👈 No reenviar
            </button>
            <button className="btn-3d-real min-h-14 rounded-2xl bg-real px-2 py-2.5 font-display text-lg font-extrabold text-white disabled:opacity-50" onClick={() => act('reenviar')} disabled={busy}>
              Reenviar 👉
            </button>
            <button className="min-h-12 rounded-2xl border-2 border-gold bg-u px-2 py-2 text-[15px] font-bold text-white disabled:opacity-50" onClick={() => act('verificar')} disabled={busy}>
              🔍 Verificar primero
            </button>
            <button className="min-h-12 rounded-2xl border-2 border-white/40 bg-u px-2 py-2 text-[15px] font-bold text-white disabled:opacity-50" onClick={() => act('reenviar_aviso')} disabled={busy}>
              ⚠️ Reenviar con aviso
              <span className="block text-xs font-normal text-[#CFC3DA]">«{WARNING_TEXT}»</span>
            </button>
          </div>
          <p className="pt-2 pb-[calc(12px+env(safe-area-inset-bottom,0px))] text-center text-[13px] text-[#CFC3DA]">Desliza la tarjeta o usa los botones</p>
        </>
      )}

      <div className="px-4 pt-2 pb-2">
        {saving && <Notice><Spinner label={saving.retry ? `Sin conexión. Reintentando (${saving.retry})…` : 'Guardando…'} /></Notice>}
        {error && (
          <Notice kind="error" action={pending.current ? <button className="rounded-xl bg-white px-4 py-2 font-bold text-ink" onClick={() => void send()}>Reintentar</button> : null}>{error}</Notice>
        )}
      </div>

      {(inVerify || phase === 'belief' || phase === 'why') && !sheet && (
        <Sheet label={inVerify ? 'Verificar la noticia' : '¿Te la crees?'}>
          <p className="mb-3 rounded-xl bg-lav px-3 py-2 text-sm text-muted"><span className="line-clamp-2">“{item.headline}”</span></p>
          {inVerify && (
            <div className="mb-3 h-1.5 overflow-hidden rounded bg-soft" role="timer" aria-label={`Tiempo para verificar: ${Math.ceil(verifyLeft * verifySeconds)} segundos`}>
              <i className={`block h-full ${verifyLeft < 0.25 ? 'bg-fake-bright' : 'bg-u2'}`} style={{ width: `${verifyLeft * 100}%` }} />
            </div>
          )}

          {phase === 'sources' && (
            <>
              <h2 className="mb-1 font-display text-2xl font-bold">🔍 ¿Dónde lo verificas?</h2>
              <p className="mb-3 text-sm text-muted">Elige una fuente para leer.</p>
              <div className="grid gap-2">
                {item.sources.map((s) => (
                  <button key={s.kind} onClick={() => void open(s.kind)} disabled={!!opening || busy}
                    className="flex min-h-14 items-center gap-3 rounded-2xl border-2 border-soft bg-white px-3 py-2 text-left hover:border-u2 disabled:opacity-60">
                    <span aria-hidden className="text-2xl">{SOURCE_KIND[s.kind].icon}</span>
                    <span><b className="block">{SOURCE_KIND[s.kind].name}</b><span className="text-sm text-muted">{s.label}</span></span>
                    {opening === s.kind && <span className="ml-auto"><Spinner label="" /></span>}
                  </button>
                ))}
              </div>
            </>
          )}

          {phase === 'reading' && source && (
            <>
              <div className="rounded-2xl border border-soft p-3">
                <p className="text-sm font-bold">{SOURCE_KIND[source.kind].icon} {source.label}{source.published ? <span className="font-normal text-muted"> · {source.published}</span> : null}</p>
                {source.comments?.length ? (
                  <ul className="mt-2 grid gap-1.5">
                    {source.comments.map((c, i) => <li key={i} className="rounded-xl bg-lav px-3 py-1.5 text-[15px]"><b className="text-sm">{c.who}:</b> {c.text}</li>)}
                  </ul>
                ) : null}
                <p className="mt-2 text-[15px] leading-snug">{source.excerpt}</p>
                {source.simulated && <p className="mt-1 text-xs text-muted">Comentarios simulados para el juego.</p>}
                {source.url && <a href={source.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-sm text-u underline">Ver la página original ↗</a>}
              </div>
              <h2 className="mt-3 mb-2 font-display text-xl font-bold">¿Qué dice esta fuente sobre la noticia?</h2>
              <div className="grid gap-2">
                {(['confirma', 'desmiente', 'nada_claro'] as const).map((ev) => (
                  <button key={ev} onClick={() => evaluate(ev)} className="min-h-12 rounded-2xl border-2 border-u bg-white px-3 py-2 font-bold text-ink hover:bg-lav">
                    {ev === 'confirma' ? '✅ ' : ev === 'desmiente' ? '❌ ' : '🤷 '}{EVAL_LABEL[ev]}
                  </button>
                ))}
              </div>
              <button onClick={() => setPhase('sources')} className="mt-3 text-sm text-u underline">← Ver otra fuente</button>
            </>
          )}

          {phase === 'final' && (
            <>
              <h2 className="mb-3 font-display text-2xl font-bold">Ya verificaste. ¿Qué haces?</h2>
              <div className="grid gap-2">
                <button onClick={() => decideFinal('reenviar')} className="btn-3d-real min-h-14 rounded-2xl bg-real px-3 py-2 font-display text-lg font-extrabold text-white">Reenviar 👉</button>
                <button onClick={() => decideFinal('reenviar_aviso')} className="min-h-12 rounded-2xl border-2 border-u bg-white px-3 py-2 font-bold text-ink">⚠️ Reenviar con aviso<span className="block text-xs font-normal text-muted">«{WARNING_TEXT}»</span></button>
                <button onClick={() => decideFinal('no_reenviar')} className="btn-3d-fake min-h-14 rounded-2xl bg-fake px-3 py-2 font-display text-lg font-extrabold text-white">👈 No reenviar</button>
              </div>
            </>
          )}

          {phase === 'belief' && (
            <>
              <h2 className="mb-1 font-display text-[28px] font-bold">¿Te la crees?</h2>
              <p className="mb-3 text-sm text-muted">Acertar suma 100 puntos y fallar resta 100. «No sé» no suma ni resta.</p>
              <div className="grid gap-2">
                {(['si', 'no', 'no_se'] as const).map((b) => (
                  <button key={b} onClick={() => chooseBelief(b)} disabled={busy}
                    className={`min-h-14 rounded-2xl px-3 py-2 font-display text-lg font-extrabold disabled:opacity-50 ${b === 'si' ? 'bg-real text-white btn-3d-real' : b === 'no' ? 'bg-fake text-white btn-3d-fake' : 'border-2 border-u bg-white text-ink'}`}>
                    {b === 'si' ? '👍 ' : b === 'no' ? '👎 ' : '🤷 '}{BELIEF_LABEL[b]}
                  </button>
                ))}
              </div>
            </>
          )}

          {phase === 'why' && (
            <>
              <h2 className="mb-1 font-display text-2xl font-bold">¿Por qué?</h2>
              <p className="mb-3 text-sm text-muted">Opcional. Toca la razón que más pesó.</p>
              <div className="flex flex-wrap gap-2">
                {REASONS.map((r) => (
                  <button key={r.key} onClick={() => finish(belief, r.key)} disabled={busy}
                    className="min-h-11 rounded-full border-2 border-soft bg-white px-4 py-2 text-base text-ink hover:border-u2 disabled:opacity-50">{r.label}</button>
                ))}
              </div>
              <button onClick={() => finish(belief, null)} disabled={busy} className="mt-3 text-sm text-u underline">Saltar</button>
            </>
          )}
          {(saving || error) && (
            <div className="mt-3">
              {saving && <p className="text-sm text-muted"><Spinner label={saving.retry ? `Sin conexión. Reintentando (${saving.retry})…` : 'Guardando…'} /></p>}
              {error && <p role="alert" className="text-sm font-bold text-fake">{error} {pending.current && <button className="underline" onClick={() => void send()}>Reintentar</button>}</p>}
            </div>
          )}
        </Sheet>
      )}

      {sheet && <FeedbackV4 fb={sheet} isLast={position >= total} onNext={goNext} />}
    </section>
  )
}

function Sheet({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-[rgba(20,10,30,.45)]">
      <div role="dialog" aria-modal="true" aria-label={label} className="anim-up max-h-[90dvh] w-full max-w-[520px] overflow-auto rounded-t-[26px] bg-white px-5 pt-5 pb-[calc(20px+env(safe-area-inset-bottom,0px))] text-ink">
        {children}
      </div>
    </div>
  )
}
