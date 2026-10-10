import { useEffect, useRef } from 'react'
import type { CardFeedbackT } from '../../lib/apiV4'
import { BELIEF_LABEL, EVAL_LABEL, SOURCE_KIND, STATE_TEXT } from './text'

/** Lo que pasa después de cada noticia: si era real o falsa, los puntos por la creencia y qué decidiste. */
export function FeedbackV4({ fb, isLast, onNext }: { fb: CardFeedbackT; isLast: boolean; onNext: () => void }) {
  const btn = useRef<HTMLButtonElement>(null)
  useEffect(() => { btn.current?.focus() }, [])

  const title = fb.timed_out ? '¡Se acabó el tiempo!'
    : fb.belief === 'no_se' ? (fb.is_real ? 'Era real' : 'Era falsa')
    : fb.belief_correct ? (fb.is_real ? '¡Bien! Era real' : '¡No te la creíste!')
    : (fb.is_real ? 'Era real, aunque no lo creas' : '¡Te la creíste!')
  const good = fb.belief_correct === true
  const pts = fb.points > 0 ? `+${fb.points}` : String(fb.points)

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-[rgba(20,10,30,.55)]">
      <div role="dialog" aria-modal="true" aria-labelledby="fb-title" className="anim-up max-h-[88dvh] w-full max-w-[520px] overflow-auto rounded-t-[26px] bg-white px-5 pt-6 pb-[calc(20px+env(safe-area-inset-bottom,0px))] text-ink">
        <h2 id="fb-title" className={`font-display text-[32px] leading-none font-extrabold ${good ? 'text-real' : fb.belief === 'no_se' || fb.timed_out ? 'text-u' : 'text-fake'}`}>{title}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className={`inline-block -rotate-3 rounded-lg border-[3px] px-2 font-display font-extrabold ${fb.is_real ? 'border-real text-real' : 'border-fake text-fake'}`}>
            {fb.is_real ? 'REAL' : 'FALSA'}
          </span>
          {!fb.timed_out && <span className="font-display text-xl font-extrabold text-u" aria-label={`${pts} puntos`}>{pts} puntos</span>}
        </div>
        <ul className="my-3 grid gap-1 rounded-2xl bg-lav px-3.5 py-2.5 text-[15px]">
          <li>📤 {STATE_TEXT[fb.state]}</li>
          {fb.belief && <li>💭 Dijiste: «{BELIEF_LABEL[fb.belief]}».</li>}
          {fb.source_kind && fb.evaluation && (
            <li>
              🔍 Leíste: {SOURCE_KIND[fb.source_kind].name.toLowerCase()}. Dijiste que «{EVAL_LABEL[fb.evaluation].toLowerCase()}»
              {fb.source_says && (fb.evaluation_correct ? ' ✔︎' : `; en realidad ${EVAL_LABEL[fb.source_says].toLowerCase()}.`)}
            </li>
          )}
        </ul>
        <p className="my-2">{fb.explanation}</p>
        {fb.red_flags.length > 0 && <ul className="my-2 list-disc pl-5">{fb.red_flags.map((f) => <li key={f}>{f}</li>)}</ul>}
        <button ref={btn} onClick={onNext} className="btn-3d mt-3 w-full min-h-14 rounded-2xl bg-gold px-6 py-4 text-[19px] font-bold text-ink">
          {isLast ? 'Ver mi resultado' : 'Siguiente noticia'}
        </button>
      </div>
    </div>
  )
}
