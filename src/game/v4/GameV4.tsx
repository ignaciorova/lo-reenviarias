import { useEffect, useMemo, useState } from 'react'
import { friendlyMessage, newSessionId } from '../../lib/api'
import { apiV4, type SessionV4T, type StudyInfoT, type SummaryV4T, type SurveyIntent } from '../../lib/apiV4'
import { entryOrigin, formatCode, isValidCode, localCode, newCode, normalizeCode, surveyLink } from '../../lib/surveyCode'
import { Chips, Logo, Notice, PrimaryButton, Spinner } from '../ui'
import { BoardV4 } from './BoardV4'
import { FinalV4 } from './FinalV4'

type Stage = 'loading' | 'intro' | 'game' | 'final'

const LS_SESSION = 'lr_session_v4'
const LS_PLAYED = 'lr_played_v4'
const store = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* modo privado */ } },
  del: (k: string) => { try { localStorage.removeItem(k) } catch { /* noop */ } },
}
const prefersReduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export default function GameV4() {
  const reduced = useMemo(prefersReduced, [])
  const [stage, setStage] = useState<Stage>('loading')
  const [info, setInfo] = useState<StudyInfoT | null>(null)
  const [payload, setPayload] = useState<SessionV4T | null>(null)
  const [summary, setSummary] = useState<SummaryV4T | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { window.scrollTo(0, 0) }, [stage])

  useEffect(() => {
    apiV4.studyInfo().then(setInfo).catch(() => setInfo(null))
    const sid = store.get(LS_SESSION)
    if (!sid) { setStage('intro'); return }
    apiV4.getSession(sid).then((p) => {
      if (p.status === 'abandoned') { store.del(LS_SESSION); setStage('intro'); return }
      setPayload(p)
      if (p.summary) setSummary(p.summary)
      setStage(p.status === 'completed' ? 'final' : p.answered_phases.includes('pre') ? 'game' : 'intro')
    }).catch(() => { store.del(LS_SESSION); setStage('intro') })
  }, [])

  const start = async (firstTime: string, intent: SurveyIntent | null, code: string | null) => {
    setError(null)
    setBusy('Preparando tu partida…')
    const sid = store.get(LS_SESSION) ?? newSessionId()
    store.set(LS_SESSION, sid)
    const onRetry = (n: number) => setBusy(`Sin conexión. Reintentando (${n})…`)
    try {
      const origin = entryOrigin(location.search) ?? (document.referrer ? 'enlace' : null)
      let p = await apiV4.startSession(sid, reduced, { origin, intent, code, replay: store.get(LS_PLAYED) === '1' }, { onRetry })
      if (!p.answered_phases.includes('pre')) {
        const q = p.questions.find((x) => x.phase === 'pre')
        if (q) await apiV4.submitPre(sid, { [q.key]: firstTime }, { onRetry })
        p = { ...p, answered_phases: ['pre'] }
      }
      setPayload(p)
      setStage(p.status === 'completed' ? 'final' : 'game')
    } catch (e) {
      setError(friendlyMessage(e))
    } finally { setBusy(null) }
  }

  const finishGame = async () => {
    if (!payload) return
    setBusy('Calculando tu resultado…')
    setStage('final')
    try {
      const s = await apiV4.completeSession(payload.session_id, { onRetry: (n) => setBusy(`Sin conexión. Reintentando (${n})…`) })
      store.set(LS_PLAYED, '1')
      setSummary(s)
    } catch (e) {
      setError(friendlyMessage(e))
    } finally { setBusy(null) }
  }

  const resetForNextPerson = () => { store.del(LS_SESSION); localCode.clear(); setPayload(null); setSummary(null); setStage('intro') }

  return (
    <div className="min-h-dvh bg-u3 text-[17px] leading-normal text-white">
      {stage === 'loading' && <div className="grid min-h-dvh place-items-center"><Spinner label="Cargando…" /></div>}
      {stage === 'intro' && <IntroV4 info={info} onStart={start} busy={busy} error={error} />}
      {stage === 'game' && payload && <BoardV4 payload={payload} reducedMotion={reduced} onDone={() => void finishGame()} />}
      {stage === 'final' && payload && (
        summary
          ? <FinalV4 summary={summary} payload={payload} reducedMotion={reduced} onNewPerson={resetForNextPerson} />
          : <main className="grid min-h-dvh place-items-center px-5 text-center">
              {busy ? <Spinner label={busy} /> : error ? <div><Notice kind="error">{error}</Notice><div className="mt-3"><PrimaryButton onClick={() => void finishGame()}>Reintentar</PrimaryButton></div></div> : null}
            </main>
      )}
    </div>
  )
}

function IntroV4({ info, onStart, busy, error }: {
  info: StudyInfoT | null; busy: string | null; error: string | null
  onStart: (firstTime: string, intent: SurveyIntent | null, code: string | null) => void
}) {
  const fromSurvey = entryOrigin(location.search) === 'encuesta'
  const stored = useMemo(() => localCode.get(), [])
  const surveyUrl = info?.survey_url ?? null
  const [firstTime, setFirstTime] = useState<string | undefined>()
  const [choice, setChoice] = useState<SurveyIntent | null>(fromSurvey ? 'antes' : null)
  const [useStored, setUseStored] = useState(!!stored)
  const [typed, setTyped] = useState('')
  const typedOk = typed.trim() === '' || isValidCode(typed)
  const code = useStored && stored ? stored : typed.trim() && isValidCode(typed) ? normalizeCode(typed) : null

  const goSurvey = () => {
    if (!surveyUrl) return
    const c = stored ?? newCode()
    localCode.set(c)
    location.href = surveyLink(surveyUrl, info?.survey_code_entry, c)
  }

  const showCodeInput = (fromSurvey || choice === 'ya_respondio') && !(useStored && stored)
  const options = ['Sí, es la primera vez', 'No, ya había jugado']

  return (
    <main className="mx-auto flex min-h-dvh max-w-[520px] flex-col justify-between gap-5 px-5 pt-[calc(22px+env(safe-area-inset-top,0px))] pb-9">
      <Logo tag={<>Radiografía Social<br />Ética</>} />
      <div>
        <h1 className="font-display text-[clamp(44px,12.4vw,80px)] leading-[1.02] font-extrabold tracking-[-.035em]">
          ¿Lo <br /><span className="whitespace-nowrap">reenviarías<span className="text-gold">?</span></span>
        </h1>
        <p className="mt-3 text-[17px]">Te llegan 10 noticias por chat. Con cada una decides qué hacer, como en la vida real.</p>
      </div>
      <div>
        <div className="grid grid-cols-2 gap-2">
          {[['👉', 'Reenviar'], ['👈', 'No reenviar'], ['🔍', 'Verificar primero'], ['⚠️', 'Reenviar con aviso']].map(([e, t]) => (
            <div key={t} className="flex items-center gap-2 rounded-2xl bg-u px-3 py-2.5 text-[15px] leading-tight"><span aria-hidden className="text-[22px]">{e}</span>{t}</div>
          ))}
        </div>
        <p className="mt-2 text-sm text-[#CFC3DA]">Después te preguntamos si te la crees. Acertar suma puntos; «No sé» no resta.</p>

        {(surveyUrl || fromSurvey) && (
          <section aria-labelledby="enc" className="mt-4 rounded-[20px] bg-white p-4 text-ink">
            <h2 id="enc" className="font-bold">📝 Encuesta del estudio <span className="font-normal text-muted">(opcional)</span></h2>
            {fromSurvey ? (
              <p className="mt-1 text-[15px]">¡Gracias por responder la encuesta!</p>
            ) : (
              <>
                <p className="mt-1 text-[15px] text-muted">Son unas preguntas sobre cómo te informas. Recomendamos responderla antes de jugar.</p>
                <div className="mt-2 grid gap-2">
                  <button type="button" onClick={goSurvey} className="min-h-12 rounded-2xl bg-u px-3 py-2 font-bold text-white">Primero la encuesta (recomendado)</button>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" aria-pressed={choice === 'ya_respondio'} onClick={() => setChoice('ya_respondio')} className={`min-h-11 rounded-2xl border-2 px-2 py-2 text-[15px] ${choice === 'ya_respondio' ? 'border-u bg-lav font-bold' : 'border-soft'}`}>Ya la respondí</button>
                    <button type="button" aria-pressed={choice === 'no'} onClick={() => setChoice('no')} className={`min-h-11 rounded-2xl border-2 px-2 py-2 text-[15px] ${choice === 'no' ? 'border-u bg-lav font-bold' : 'border-soft'}`}>Solo jugar</button>
                  </div>
                </div>
              </>
            )}
            {(fromSurvey || choice === 'ya_respondio') && stored && (
              <label className="mt-2 flex items-start gap-2 text-[15px]">
                <input type="checkbox" className="mt-1 h-5 w-5" checked={useStored} onChange={(e) => setUseStored(e.target.checked)} />
                <span>Enlazar con mi código <b className="tabular">{formatCode(stored)}</b> (el que se usó en este teléfono)</span>
              </label>
            )}
            {showCodeInput && (
              <div className="mt-2">
                <label htmlFor="code" className="text-sm">Tu código de la encuesta, si lo tienes:</label>
                <input id="code" inputMode="text" autoCapitalize="characters" autoComplete="off" maxLength={12} value={typed} onChange={(e) => setTyped(e.target.value)}
                  placeholder="XXXX-XXXX" aria-invalid={!typedOk} aria-describedby="code-h"
                  className={`mt-1 w-full rounded-xl border-2 px-3 py-2 font-mono text-lg tracking-widest uppercase ${typedOk ? 'border-soft' : 'border-fake'}`} />
                <p id="code-h" className={`mt-1 text-xs ${typedOk ? 'text-muted' : 'font-bold text-fake'}`}>{typedOk ? 'Si no lo tienes, puedes jugar igual.' : 'Ese código no es válido. Revísalo o déjalo en blanco.'}</p>
              </div>
            )}
          </section>
        )}

        <div className="mt-4 rounded-[20px] bg-white p-4 text-ink">
          <p id="pv" className="mb-2 font-bold">¿Es la primera vez que juegas este juego?</p>
          <Chips labelledBy="pv" options={options} value={firstTime} onChange={setFirstTime} />
        </div>

        <div className="mt-4 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm">
          <p>Juego académico de ULACIT sobre cómo decidimos qué compartir. Es <b>anónimo</b>: no pedimos nombre, correo ni datos de contacto, y no guardamos tu dirección IP en la base de datos del estudio. Puedes dejar de jugar cuando quieras.</p>
        </div>
        <div className="h-3.5" />
        {error && <div className="mb-3"><Notice kind="error">{error}</Notice></div>}
        <PrimaryButton onClick={() => firstTime && typedOk && onStart(firstTime, fromSurvey ? 'antes' : choice, code)} disabled={!!busy || !firstTime || !typedOk}>
          {busy ? <Spinner label={busy} /> : 'Acepto y quiero jugar'}
        </PrimaryButton>
        <p className="mt-2 text-center text-sm text-[#CFC3DA]">{!firstTime ? 'Responde la pregunta de arriba para empezar.' : '10 noticias. Unos 4 minutos. Sin nombre.'}</p>
      </div>
    </main>
  )
}
