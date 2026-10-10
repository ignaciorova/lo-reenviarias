import { useState } from 'react'
import { apiV4, type SessionV4T, type SummaryV4T } from '../../lib/apiV4'
import { formatCode, isValidCode, localCode, newCode, normalizeCode, surveyLink } from '../../lib/surveyCode'
import { rankFor } from '../FinalScreen'
import { Leaderboard } from '../Leaderboard'
import { Logo, PrimaryButton } from '../ui'

export function FinalV4({ summary, payload, onNewPerson }: { summary: SummaryV4T; payload: SessionV4T; reducedMotion: boolean; onNewPerson: () => void }) {
  const [medal, rank] = rankFor(summary.correct_count)
  const c = summary.counts
  const [shareLabel, setShareLabel] = useState('Retar a un amigo')

  const share = async () => {
    const url = `${location.origin}/?origen=enlace`
    const text = `Hice ${summary.score ?? 0} puntos en "¿Lo reenviarías?" 🕵️ ¿Qué harías tú con estas noticias?`
    if (navigator.share) { try { await navigator.share({ title: '¿Lo reenviarías?', text, url }) } catch { /* cancelado */ } }
    else { try { await navigator.clipboard.writeText(`${text} ${url}`); setShareLabel('Enlace copiado') } catch { setShareLabel('No se pudo copiar') } }
  }

  return (
    <main className="mx-auto max-w-[520px] px-5 pt-[calc(22px+env(safe-area-inset-top,0px))] pb-9">
      <Logo tag="Tu resultado" />
      <div aria-hidden className="my-1.5 text-[72px] leading-none">{medal}</div>
      <h1 className="font-display text-[clamp(38px,10vw,58px)] leading-none font-extrabold">{rank}</h1>
      <div className="my-4 grid grid-cols-3 gap-2">
        <Stat v={String(summary.score ?? '–')} l="puntos" />
        <Stat v={`${summary.correct_count}/${summary.decisions_count}`} l="adivinaste si eran reales" />
        <Stat v={summary.percentile !== null ? `${summary.percentile}%` : '–'} l={summary.percentile !== null ? 'superaste' : 'aún pocos datos'} />
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <Mini e="🔍" v={c.verified} l="verificaste" />
        <Mini e="⚠️" v={c.with_warning} l="con aviso" />
        <Mini e="🤷" v={c.no_se} l="«No sé»" />
      </div>

      {payload.config.leaderboard && <Leaderboard sessionId={payload.session_id} />}
      <SurveyAfter payload={payload} />

      <ul className="my-3.5 list-none p-0">
        {summary.recap.map((r) => (
          <li key={r.position} className="flex gap-2.5 border-b border-white/15 py-2.5 text-sm">
            <span aria-label={r.belief_correct ? 'Acertaste' : r.belief === 'no_se' ? 'No sabías' : r.state === 'E7' ? 'Tiempo agotado' : 'Fallaste'}>
              {r.state === 'E7' ? '⏱️' : r.belief_correct ? '✅' : r.belief === 'no_se' ? '🤷' : '❌'}
            </span>
            <span>{r.headline.length > 72 ? `${r.headline.slice(0, 72)}…` : r.headline} <b>{r.is_real ? 'Real' : 'Falsa'}</b>{r.verified ? ' 🔍' : ''}</span>
          </li>
        ))}
      </ul>
      <PrimaryButton onClick={() => void share()}>{shareLabel}</PrimaryButton>
      <p className="mt-3 text-center text-sm text-[#CFC3DA]" role="status">Tu partida anónima quedó guardada. ¡Gracias por participar!</p>
      <button onClick={onNewPerson} className="mx-auto mt-6 block text-sm text-[#CFC3DA] underline underline-offset-4">¿Compartes este dispositivo? Iniciar partida para otra persona</button>
    </main>
  )
}

/** Invitación a la encuesta al final, con el código ya escrito. Solo si no la respondió antes. */
function SurveyAfter({ payload }: { payload: SessionV4T }) {
  const url = payload.config.survey_url
  const [code, setCode] = useState<string | null>(payload.survey_code)
  const [typing, setTyping] = useState(false)
  const [typed, setTyped] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  if (!url) return null
  const answeredBefore = payload.survey_intent === 'antes' || payload.survey_intent === 'ya_respondio'

  const go = async () => {
    const c = code ?? localCode.get() ?? newCode()
    localCode.set(c)
    try { await apiV4.setSurveyCode(payload.session_id, c, 'despues'); setCode(c) } catch { /* se puede enlazar después */ }
    window.open(surveyLink(url, payload.config.survey_code_entry, c), '_blank', 'noopener')
  }
  const link = async () => {
    if (!isValidCode(typed)) { setMsg('Ese código no es válido.'); return }
    try { await apiV4.setSurveyCode(payload.session_id, normalizeCode(typed), 'ya_respondio'); setCode(normalizeCode(typed)); setMsg('Listo: quedó enlazado.'); setTyping(false) }
    catch { setMsg('No se pudo enlazar. Inténtalo de nuevo.') }
  }

  if (answeredBefore && code) {
    return <p className="my-3 text-center text-sm text-[#CFC3DA]">Código de tu encuesta: <b className="tabular">{formatCode(code)}</b></p>
  }
  return (
    <section className="my-4 rounded-[20px] bg-white p-4 text-ink">
      <h2 className="font-display text-xl font-bold">📝 ¿Nos ayudas con la encuesta?</h2>
      <p className="mt-1 text-[15px] text-muted">Es opcional y anónima. Se abre en otra pestaña con tu código ya escrito.</p>
      <button onClick={() => void go()} className="mt-2 min-h-12 w-full rounded-2xl bg-u px-3 py-2 font-bold text-white">Responder la encuesta</button>
      {code && <p className="mt-2 text-sm">Tu código: <b className="tabular">{formatCode(code)}</b></p>}
      {!typing ? (
        <button onClick={() => setTyping(true)} className="mt-2 text-sm text-u underline">Ya la respondí y tengo un código</button>
      ) : (
        <div className="mt-2 flex gap-2">
          <input aria-label="Código de la encuesta" value={typed} onChange={(e) => setTyped(e.target.value)} maxLength={12} placeholder="XXXX-XXXX"
            className="min-w-0 flex-1 rounded-xl border-2 border-soft px-3 py-2 font-mono uppercase" />
          <button onClick={() => void link()} className="rounded-xl bg-u px-3 font-bold text-white">Enlazar</button>
        </div>
      )}
      {msg && <p role="status" className="mt-1 text-sm">{msg}</p>}
    </section>
  )
}

function Stat({ v, l }: { v: string; l: string }) {
  return <div className="rounded-2xl bg-u p-3 text-center"><b className="block font-display text-[28px] leading-tight tabular">{v}</b><span className="text-xs leading-tight text-[#CFC3DA]">{l}</span></div>
}
function Mini({ e, v, l }: { e: string; v: number; l: string }) {
  return <div className="rounded-xl bg-white/10 px-2 py-2"><span aria-hidden>{e}</span> <b className="tabular">{v}</b> <span className="text-[#CFC3DA]">{l}</span></div>
}
