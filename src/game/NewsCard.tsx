import { forwardRef, useImperativeHandle, useRef } from 'react'
import type { ItemT } from '../lib/api'
import { MediaFrame, MediaSchema } from './MediaFrame'

export type CardHandle = { fly: (dir: 1 | -1) => void }
type Props = { item: ItemT; back?: boolean; hint?: string; disabled?: boolean; onSwipe?: (dir: 1 | -1) => void }

const THRESHOLD = 90

export const NewsCard = forwardRef<CardHandle, Props>(function NewsCard({ item, back, hint, disabled, onSwipe }, ref) {
  const el = useRef<HTMLDivElement>(null)
  const lr = useRef<HTMLSpanElement>(null)
  const lf = useRef<HTMLSpanElement>(null)
  const drag = useRef({ on: false, x0: 0, dx: 0 })

  const setLabels = (dx: number) => {
    if (lr.current) lr.current.style.opacity = String(Math.max(0, Math.min(1, dx / THRESHOLD)))
    if (lf.current) lf.current.style.opacity = String(Math.max(0, Math.min(1, -dx / THRESHOLD)))
  }

  useImperativeHandle(ref, () => ({
    fly(dir) {
      const c = el.current
      if (!c) return
      setLabels(dir * THRESHOLD)
      c.style.transition = 'transform .35s ease-in'
      c.style.transform = `translateX(${dir * 140}%) rotate(${dir * 25}deg)`
    },
  }))

  const d = item.display
  // Imagen o clip (versión 3.0.0); si el dato no es válido, la tarjeta se muestra sin él, como en la 2.0.0.
  const parsedMedia = MediaSchema.safeParse((d as { media?: unknown }).media)
  const media = parsedMedia.success ? parsedMedia.data : undefined
  return (
    <div
      ref={el}
      aria-hidden={back || undefined}
      className={`absolute inset-0 flex flex-col overflow-hidden rounded-3xl bg-white text-ink shadow-[0_18px_40px_rgba(0,0,0,.4)] select-none touch-pan-y ${back ? 'translate-y-3.5 scale-[.94] brightness-[.8]' : 'anim-enter'}`}
      onPointerDown={(e) => {
        if (back || disabled) return
        drag.current = { on: true, x0: e.clientX, dx: 0 }
        el.current?.setPointerCapture(e.pointerId)
        if (el.current) el.current.style.transition = 'none'
      }}
      onPointerMove={(e) => {
        if (!drag.current.on || !el.current) return
        const dx = e.clientX - drag.current.x0
        drag.current.dx = dx
        el.current.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`
        setLabels(dx)
      }}
      onPointerUp={() => end()}
      onPointerCancel={() => end()}
    >
      {media ? (
        <div className="relative min-h-[120px] flex-[0_1_55%] overflow-hidden">
          <MediaFrame m={media} who={d.who} many={d.many} back={back} />
          <span className="absolute top-2.5 right-0 rounded-l-lg bg-fake px-3 py-1 font-display text-[13px] font-extrabold text-white">{d.band}</span>
          <span className="absolute right-2.5 bottom-2 rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] text-white">Juego académico ULACIT</span>
        </div>
      ) : (
        <div className="relative grid min-h-[120px] flex-[0_1_42%] place-items-center overflow-hidden" style={{ background: d.bg }}>
          <span className="absolute top-3.5 left-0 rounded-r-lg bg-fake px-3 py-1 font-display text-[13px] font-extrabold text-white">{d.band}</span>
          <span aria-hidden className="text-[clamp(70px,22vw,110px)] leading-none drop-shadow-[0_6px_10px_rgba(0,0,0,.25)]">{d.emo}</span>
          <span aria-hidden className="absolute right-[14%] bottom-[14%] rotate-12 text-[clamp(34px,10vw,52px)]">{d.emo2}</span>
          <span className="absolute right-2.5 bottom-2 rounded-md bg-black/35 px-1.5 py-0.5 text-[10px] text-white">Juego académico ULACIT</span>
        </div>
      )}
      <div className="flex flex-[1_0_auto] flex-col gap-1.5 px-[18px] pt-3.5 pb-4">
        <div className="flex items-center gap-1.5 text-[13px] text-muted">
          <b>{d.who}</b><span className="italic">↪︎ {d.many ? 'Reenviado muchas veces' : 'Reenviado'}</span>
        </div>
        <h2 className="font-display text-[clamp(20px,5.6vw,25px)] leading-tight font-bold">{item.headline}</h2>
        {hint && <p className="anim-pop rounded-xl bg-[#FFF6D6] px-2.5 py-2 text-sm" role="status">🔍 {hint}</p>}
      </div>
      {!back && (
        <>
          <span ref={lr} aria-hidden className="pointer-events-none absolute top-5 left-4 z-10 -rotate-12 rounded-lg border-4 border-real bg-white/90 px-3 font-display text-3xl font-extrabold text-real opacity-0">REAL</span>
          <span ref={lf} aria-hidden className="pointer-events-none absolute top-5 right-4 z-10 rotate-12 rounded-lg border-4 border-fake bg-white/90 px-3 font-display text-3xl font-extrabold text-fake opacity-0">FALSA</span>
        </>
      )}
    </div>
  )

  function end() {
    if (!drag.current.on) return
    drag.current.on = false
    const dx = drag.current.dx
    if (dx > THRESHOLD) onSwipe?.(1)
    else if (dx < -THRESHOLD) onSwipe?.(-1)
    else if (el.current) {
      el.current.style.transition = 'transform .25s'
      el.current.style.transform = ''
      setLabels(0)
    }
  }
})
