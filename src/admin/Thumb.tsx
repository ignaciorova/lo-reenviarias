import { MediaSchema, mediaUrl } from '../game/MediaFrame'
import type { CardDisplay } from './cards'

/** Miniatura de una tarjeta: su imagen (o la portada del clip) o, si no tiene, sus emojis sobre el fondo. */
export function Thumb({ display, size = 56 }: { display: CardDisplay; size?: number }) {
  const m = MediaSchema.safeParse(display.media)
  const style = { width: size, height: size }
  if (m.success) {
    const src = m.data.kind === 'video' ? m.data.poster : m.data.src
    if (src) return <img src={mediaUrl(src)} alt="" style={{ ...style, objectPosition: m.data.focus }} className="shrink-0 rounded-lg object-cover" />
    return <span style={style} className="grid shrink-0 place-items-center rounded-lg bg-black text-xl text-white" aria-hidden>▶</span>
  }
  return <span style={{ ...style, background: display.bg }} className="grid shrink-0 place-items-center rounded-lg text-2xl" aria-hidden>{display.emo}</span>
}
