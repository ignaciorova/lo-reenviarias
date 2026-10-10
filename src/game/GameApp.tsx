import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { api, friendlyMessage, localSession, newSessionId, type QuestionT, type SessionPayloadT, type SummaryT } from '../lib/api'
import { isConfigured } from '../lib/supabase'
import { apiV4 } from '../lib/apiV4'
import { GameBoard } from './GameBoard'
import { FinalScreen } from './FinalScreen'
import { Chips, Logo, Notice, PrimaryButton, Spinner } from './ui'

type Stage = 'loading' | 'intro' | 'opinion' | 'game' | 'post' | 'final'

const prefersReduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function stageFor(p: SessionPayloadT): Stage {
  if (p.status === 'completed') return 'final'
  if (!p.answered_phases.includes('pre')) return 'opinion'
  if (p.decisions.length < p.items.length) return 'game'
  return 'post'
}

const GameV4 = lazy(() => import('./v4/GameV4'))

/**
 * Elige el juego según la versión activa: la 4.0.0 («responsabilidad») tiene su propio flujo;
 * las versiones 1.0.0–3.1.0 siguen con el juego de clasificación sin ningún cambio.
 * Si el servidor no tiene la función study_info (base sin la migración 4.0.0), se usa el juego anterior.
 */
export default function GameApp() {
  const [mode, setMode] = useState<'loading' | 'v4' | 'legacy'>(isConfigured ? 'loading' : 'legacy')
  useEffect(() => {
    if (!isConfigured) return
    apiV4.studyInfo().then((i) => setMode(i.mode === 'responsabilidad' ? 'v4' : 'legacy')).catch(() => setMode('legacy'))
  }, [])
  const loading = <div className="grid min-h-dvh place-items-center bg-u3 text-white"><Spinner label="Cargando…" /></div>
  if (mode === 'loading') return loading
  if (mode === 'v4') return <Suspense fallback={loading}><GameV4 /></Suspense>
  return <LegacyGame />
}

function LegacyGame() {
  const reduced = useMemo(prefersReduced, [])
  const [stage, setStage] = useState<Stage>('loading')
  const [payload, setPayload] = useState<SessionPayloadT | null>(null)
  const [summary, setSummary] = useState<SummaryT | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [counter, setCounter] = useState<string>('')

  useEffect(() => { window.scrollTo(0, 0) }, [stage])

  // Reanudar una partida existente en este dispositivo (recarga o falla de red)
  useEffect(() => {
    if (!isConfigured) { setStage('intro'); return }
    const sid = localSession.get()
    api.publicStats().then((s) => {
      if (s.n) setCounter(`🔥 ${s.n} personas ya jugaron. Promedio: ${s.mean_correct?.toFixed(1)} de 10.`)
    }).catch(() => {})
    if (!sid) { setStage('intro'); return }
    api.getSession(sid).then((p) => {
      setPayload(p)
      if (p.summary) setSummary(p.summary)
      setStage(p.status === 'abandoned' ? 'intro' : stageFor(p))
    }).catch(() => { localSession.clear(); setStage('intro') })
  }, [])

  const start = async () => {
    setError(null)
    setBusy('Preparando tu partida…')
    const sid = localSession.get() ?? newSessionId()
    localSession.set(sid)
    try {
      const p = await api.startSession(sid, reduced, { onRetry: (n) => setBusy(`Sin conexión. Reintentando (${n})…`) })
      setPayload(p)
      setStage(stageFor(p))
    } catch (e) {
      setError(friendlyMessage(e))
    } finally { setBusy(null) }
  }

  const sendSurvey = async (phase: 'pre' | 'post', answers: Record<string, string>) => {
    if (!payload) return
    setError(null)
    setBusy('Guardando…')
    try {
      await api.submitSurvey(payload.session_id, phase, answers, { onRetry: (n) => setBusy(`Sin conexión. Reintentando (${n})…`) })
      if (phase === 'pre') { setPayload({ ...payload, answered_phases: ['pre'] }); setStage('game') }
      else {
        setBusy('Calculando tu resultado…')
        const s = await api.completeSession(payload.session_id, { onRetry: (n) => setBusy(`Sin conexión. Reintentando (${n})…`) })
        setSummary(s)
        setStage('final')
      }
    } catch (e) {
      setError(friendlyMessage(e))
    } finally { setBusy(null) }
  }

  const resetForNextPerson = () => { localSession.clear(); setPayload(null); setSummary(null); setStage('intro') }

  return (
    <div className="min-h-dvh bg-u3 text-[17px] leading-normal text-white">
      {stage === 'loading' && <div className="grid min-h-dvh place-items-center"><Spinner label="Cargando…" /></div>}
      {stage === 'intro' && <Intro onStart={start} busy={busy} error={error} counter={counter} />}
      {stage === 'opinion' && payload && (
        <SurveyScreen key="pre" questions={payload.questions.filter((q) => q.phase === 'pre')} level="Nivel 0: calentamiento"
          title="Primero, tu opinión honesta" subtitle="No hay respuestas correctas. Esto no suma puntos." cta="Empezar el juego"
          busy={busy} error={error} onSubmit={(a) => sendSurvey('pre', a)} />
      )}
      {stage === 'game' && payload && <GameBoard payload={payload} reducedMotion={reduced} onDone={() => setStage('post')} />}
      {stage === 'post' && payload && (
        <SurveyScreen key="post" questions={payload.questions.filter((q) => q.phase === 'post')} level="Última pregunta"
          title="Después de jugar…" cta="Ver mi resultado" busy={busy} error={error} onSubmit={(a) => sendSurvey('post', a)} />
      )}
      {stage === 'final' && summary && <FinalScreen summary={summary} sessionId={payload?.session_id} reducedMotion={reduced} onNewPerson={resetForNextPerson} />}
    </div>
  )
}

function Intro({ onStart, busy, error, counter }: { onStart: () => void; busy: string | null; error: string | null; counter: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[520px] flex-col justify-between gap-5 px-5 pt-[calc(22px+env(safe-area-inset-top,0px))] pb-9">
      <Logo tag={<>Radiografía Social<br />Ética</>} />
      <div className="relative mt-[2vh]">
        <h1 className="font-display text-[clamp(44px,12.4vw,88px)] leading-[1.02] font-extrabold tracking-[-.035em]">
          ¿Lo <br /><span className="whitespace-nowrap">reenviarías<span className="text-gold">?</span></span>
        </h1>
        <div aria-hidden className="relative my-3.5 h-[150px]">
          {[
            { l: '2%', t: 18, r: -8, bg: '#F7E9EF', h: 'Hacienda congelará cuentas…', s: 'FALSA', c: 'var(--color-fake)', f: 'Reenviado muchas veces' },
            { l: '20%', t: 8, r: 3, bg: '#E9F6EF', h: 'EE.UU. impone arancel…', s: 'REAL', c: 'var(--color-real)', f: 'Reenviado' },
            { l: '36%', t: 22, r: 10, bg: '#fff', h: '¿Real o falsa? Tú decides.', s: '', c: '', f: 'Reenviado muchas veces' },
          ].map((m) => (
            <div key={m.h} className="absolute h-[120px] w-[62%] rounded-2xl p-3 text-[13px] leading-tight text-ink shadow-[0_10px_30px_rgba(0,0,0,.35)]" style={{ left: m.l, top: m.t, transform: `rotate(${m.r}deg)`, background: m.bg }}>
              ↪︎ {m.f}<b className="mt-1.5 block font-display text-[17px]">{m.h}</b>
              {m.s && <span className="absolute right-2 bottom-2 -rotate-[10deg] rounded-md border-[3px] px-1.5 font-display text-[15px] font-extrabold" style={{ color: m.c }}>{m.s}</span>}
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="my-1.5 grid grid-cols-3 gap-2">
          {[['👉', 'Desliza a la derecha si es real'], ['👈', 'A la izquierda si es falsa'], ['🔍', 'Tienes 2 lupas para investigar']].map(([e, t]) => (
            <div key={t} className="rounded-2xl bg-u px-2 py-3 text-center text-[13px] leading-tight"><span aria-hidden className="mb-1 block text-[26px]">{e}</span>{t}</div>
          ))}
        </div>
        <p className="my-2.5 min-h-[1.4em] text-sm text-gold" aria-live="polite">{counter}</p>
        <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm">
          <p>Este es un juego académico de ULACIT sobre cómo decidimos qué noticias compartir. Es <b>anónimo</b>: no pedimos nombre, correo ni datos de contacto, y no guardamos tu dirección IP en la base de datos del estudio.</p>
          <p className="mt-2">Tus respuestas se analizarán solo con fines académicos y de forma agregada. Puedes dejar de jugar cuando quieras. Por favor, no escribas datos personales en las respuestas abiertas.</p>
        </div>
        <div className="h-3.5" />
        {error && <div className="mb-3"><Notice kind="error">{error}</Notice></div>}
        {!isConfigured && <div className="mb-3"><Notice kind="error">La aplicación no está configurada (faltan las variables de Supabase).</Notice></div>}
        <PrimaryButton onClick={onStart} disabled={!!busy || !isConfigured} aria-describedby="consent-note">
          {busy ? <Spinner label={busy} /> : 'Acepto y quiero jugar'}
        </PrimaryButton>
        <p id="consent-note" className="mt-2 text-center text-sm text-[#CFC3DA]">10 noticias. Unos 3 minutos. Sin nombre.</p>
      </div>
    </main>
  )
}

function SurveyScreen({ questions, level, title, subtitle, cta, busy, error, onSubmit }: {
  questions: QuestionT[]; level: string; title: string; subtitle?: string; cta: string; busy: string | null; error: string | null; onSubmit: (a: Record<string, string>) => void
}) {
  const [ans, setAns] = useState<Record<string, string>>({})
  const answered = (q: QuestionT) => !q.required || (q.kind === 'open' ? (ans[q.key]?.trim().length ?? 0) >= q.min_length : !!ans[q.key])
  const pending = questions.filter((q) => !answered(q)).length
  const complete = pending === 0
  return (
    <main className="mx-auto max-w-[520px] px-5 pt-[calc(22px+env(safe-area-inset-top,0px))] pb-9">
      <span className="mb-2.5 inline-block rounded-full bg-gold px-3 py-1 text-[13px] font-bold text-ink">{level}</span>
      <h1 className="mb-1.5 font-display text-[32px] leading-tight font-bold">{title}</h1>
      {subtitle && <p className="text-sm text-[#CFC3DA]">{subtitle}</p>}
      <form onSubmit={(e) => { e.preventDefault(); if (complete && !busy) onSubmit(Object.fromEntries(Object.entries(ans).map(([k, v]) => [k, v.trim()]))) }}>
        {questions.map((q) => (
          <div key={q.key} className="my-3.5 rounded-[20px] bg-white p-[18px] text-ink">
            {q.kind === 'open' ? (
              <>
                <label htmlFor={`q-${q.key}`} className="mb-2.5 block font-bold">{q.prompt}</label>
                <textarea id={`q-${q.key}`} aria-describedby={`h-${q.key}`} maxLength={q.max_length} value={ans[q.key] ?? ''} onChange={(e) => setAns({ ...ans, [q.key]: e.target.value })}
                  placeholder="Escribe lo que realmente harías…" className="min-h-[110px] w-full resize-y rounded-xl border-2 border-soft p-3 text-ink focus:border-u focus:outline-none" />
                {/* Si la respuesta es más corta que el mínimo, se dice por qué no se puede avanzar (antes solo se desactivaba el botón). */}
                <div className="mt-1 flex items-start justify-between gap-3 text-xs">
                  <p id={`h-${q.key}`} aria-live="polite" className={(ans[q.key] ?? '').trim().length > 0 && !answered(q) ? 'font-bold text-fake' : 'text-muted'}>
                    {q.required && q.min_length > 1 ? `Escribe al menos ${q.min_length} caracteres.` : ''}
                  </p>
                  <p className="shrink-0 text-muted tabular">{(ans[q.key] ?? '').length}/{q.max_length}</p>
                </div>
              </>
            ) : (
              <>
                <p id={`l-${q.key}`} className="mb-2.5 font-bold">{q.prompt}</p>
                <Chips labelledBy={`l-${q.key}`} options={q.options} value={ans[q.key]} onChange={(v) => setAns({ ...ans, [q.key]: v })} />
              </>
            )}
          </div>
        ))}
        {error && <div className="mb-3"><Notice kind="error">{error}</Notice></div>}
        <PrimaryButton type="submit" disabled={!complete || !!busy}>{busy ? <Spinner label={busy} /> : cta}</PrimaryButton>
        {!complete && <p className="mt-2 text-center text-sm text-[#CFC3DA]">{pending === 1 ? 'Te falta 1 pregunta para continuar.' : `Te faltan ${pending} preguntas para continuar.`}</p>}
      </form>
    </main>
  )
}
