import { z } from 'zod'
import { useEffect, useRef } from 'react'

/** Imagen o clip corto de una noticia, presentado como lo vería alguien en su red social (versión 3.0.0). */
// Solo archivos del propio sitio, en /media/ (el marco nunca carga nada de otro dominio).
const localFile = z.string().regex(/^\/media\/[a-z0-9/_-]+\.(jpg|png|svg|webp|mp4|webm)$/)
export const MediaSchema = z.object({
  kind: z.enum(['image', 'video']),
  src: localFile,
  /** Versión WebM opcional (algunos navegadores sin H.264) */
  webm: localFile.optional(),
  poster: localFile.optional(),
  alt: z.string().min(3),
  /** Aviso visible sobre el origen de la imagen (p. ej., generada con IA) */
  credit: z.string().optional(),
  /** Punto de la imagen que debe quedar visible al recortarla (CSS object-position) */
  focus: z.string().regex(/^\d{1,3}% \d{1,3}%$/).optional(),
  frame: z.enum(['whatsapp', 'facebook', 'tiktok']),
})
export type Media = z.infer<typeof MediaSchema>

const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function Visual({ m, back, className = '' }: { m: Media; back?: boolean; className?: string }) {
  const v = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    // Sin sonido, en bucle y solo en la tarjeta visible; con «reducir movimiento» queda la imagen fija.
    if (!v.current) return
    if (back || reduced()) v.current.pause()
    else void v.current.play().catch(() => {})
  }, [back])
  if (m.kind === 'video') {
    return (
      <video ref={v} poster={m.poster} muted loop playsInline preload="metadata" aria-label={m.alt}
        className={`pointer-events-none h-full w-full object-cover ${className}`}>
        {m.webm && <source src={m.webm} type="video/webm" />}
        <source src={m.src} type="video/mp4" />
      </video>
    )
  }
  return <img src={m.src} alt={m.alt} draggable={false} style={{ objectPosition: m.focus }} className={`pointer-events-none h-full w-full object-cover ${className}`} />
}

function Credit({ m }: { m: Media }) {
  return m.credit ? <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/55 px-1 py-px text-[9px] text-white/90">{m.credit}</span> : null
}

export function MediaFrame({ m, who, many, back }: { m: Media; who: string; many: boolean; back?: boolean }) {
  if (m.frame === 'whatsapp') {
    return (
      <div className="flex h-full flex-col bg-[#E5DDD5] p-2.5">
        <div className="flex min-h-0 flex-1 flex-col rounded-xl rounded-tl-none bg-white p-1.5 shadow-sm">
          <span className="px-1 pb-1 text-[12px] text-[#667781] italic">↪︎ {many ? 'Reenviado muchas veces' : 'Reenviado'}</span>
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg"><Visual m={m} back={back} /><Credit m={m} /></div>
        </div>
      </div>
    )
  }
  if (m.frame === 'facebook') {
    return (
      <div className="flex h-full flex-col bg-white">
        <div className="flex items-center gap-2 px-3 py-2">
          <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full bg-[#1877F2] font-bold text-white">{who.replace(/[^\p{L}]/gu, '').charAt(0)}</span>
          <span className="text-[13px] leading-tight"><b>{who}</b><span className="block text-[11px] text-[#65676B]">2 h · 🌎 compartió una publicación</span></span>
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden"><Visual m={m} back={back} /><Credit m={m} /></div>
      </div>
    )
  }
  return (
    <div className="relative h-full bg-black">
      <Visual m={m} back={back} className="opacity-95" />
      <span className="absolute top-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-[12px] text-white" aria-hidden>🔇</span>
      <div aria-hidden className="absolute right-2 bottom-8 flex flex-col items-center gap-2 text-lg text-white drop-shadow">
        <span>♥<small className="block text-[10px]">12,4 k</small></span><span>💬<small className="block text-[10px]">893</small></span><span>↪︎<small className="block text-[10px]">5 k</small></span>
      </div>
      {m.credit && <span className="pointer-events-none absolute top-8 left-2 rounded bg-black/55 px-1 py-px text-[9px] text-white/90">{m.credit}</span>}
      <span className="absolute bottom-3 left-3 text-[13px] font-bold text-white drop-shadow">@{who.toLowerCase().replace(/[^\p{L}]+/gu, '_')}</span>
    </div>
  )
}
