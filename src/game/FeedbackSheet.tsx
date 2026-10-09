import { useEffect, useRef, useState } from 'react'
import type { FeedbackT } from '../lib/api'

function useCountUp(to: number, reduced: boolean) {
  const [v, setV] = useState(reduced ? to : 0)
  useEffect(() => {
    if (reduced || !to) { setV(to); return }
    const t0 = performance.now()
    let raf = 0
    const f = (t: number) => {
      const p = Math.min(1, (t - t0) / 1200)
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(f)
    }
    raf = requestAnimationFrame(f)
    return () => cancelAnimationFrame(raf)
  }, [to, reduced])
  return v
}

export function FeedbackSheet({ fb, isLast, onNext, reducedMotion }: { fb: FeedbackT; isLast: boolean; onNext: () => void; reducedMotion: boolean }) {
  const btn = useRef<HTMLButtonElement>(null)
  useEffect(() => { btn.current?.focus() }, [])
  const reach = useCountUp(fb.simulated_reach, reducedMotion)

  const title = fb.timed_out ? '¡Se acabó el tiempo!'
    : fb.is_correct ? (fb.is_real ? '¡Bien! Era real' : '¡No te la creíste!')
    : (fb.is_real ? 'Era real, aunque no lo creas' : '¡Te la creíste!')
  const src = fb.is_real && fb.source_label ? fb.source_label.replace('Fuente citada: ', '') : null

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-[rgba(20,10,30,.55)]">
      <div role="dialog" aria-modal="true" aria-labelledby="fb-title" className="anim-up max-h-[88dvh] w-full max-w-[520px] overflow-auto rounded-t-[26px] bg-white px-5 pt-6 pb-[calc(20px+env(safe-area-inset-bottom,0px))] text-ink">
        <h2 id="fb-title" className={`font-display text-[34px] leading-none font-extrabold ${fb.is_correct ? 'text-real' : 'text-fake'}`}>{title}</h2>
        <span className={`my-2 inline-block -rotate-3 rounded-lg border-[3px] px-2 font-display font-extrabold ${fb.is_real ? 'border-real text-real' : 'border-fake text-fake'}`}>
          {fb.is_real ? 'REAL' : 'FALSA'}
        </span>
        {fb.is_correct && (
          <p className="font-display text-xl font-extrabold text-u">
            +{fb.points_awarded} puntos{(fb.streak ?? 0) >= 2 ? ` 🔥 racha de ${fb.streak}` : ''}{fb.hint_used ? ' (con lupa)' : ''}
          </p>
        )}
        {fb.simulated_reach > 0 && (
          <div className="my-3 rounded-2xl bg-[#FDECEC] p-3.5">
            Si la hubieras reenviado, podría haber llegado a
            <b className="block font-display text-[34px] leading-none text-fake tabular" aria-live="polite">{reach.toLocaleString('es-CR')}</b>
            personas en una hora 😬
            <small className="mt-1 block text-xs text-muted">Simulación ilustrativa, no es un dato real de difusión.</small>
          </div>
        )}
        <p className="my-2">{fb.explanation}{src && <span className="text-sm text-muted"> ({src})</span>}</p>
        {fb.red_flags.length > 0 && (
          <ul className="my-2 list-disc pl-5">{fb.red_flags.map((f) => <li key={f}>{f}</li>)}</ul>
        )}
        {fb.crowd && <p className="text-sm text-muted">👥 {fb.crowd.error_pct}% de quienes jugaron antes se equivocó con esta.</p>}
        <button ref={btn} onClick={onNext} className="btn-3d mt-3 w-full min-h-14 rounded-2xl bg-gold px-6 py-4 text-[19px] font-bold text-ink">
          {isLast ? 'Terminar' : 'Siguiente noticia'}
        </button>
      </div>
    </div>
  )
}
