import { useState, type ReactNode } from 'react'
import { NewsCard } from '../game/NewsCard'
import type { Media } from '../game/MediaFrame'
import { BACKGROUNDS, DEFAULT_CREDIT, MAX_VIDEO_MB, VALIDATION, keyFromHeadline, saveCard, uploadImage, uploadVideo, type CardDraft } from './cards'

const FRAMES: [Media['frame'], string][] = [['whatsapp', 'WhatsApp'], ['facebook', 'Facebook'], ['tiktok', 'TikTok']]

/** Formulario de una tarjeta con vista previa igual a la del juego. */
export function CardEditor({ initial, takenKeys, categories, canEdit, onSaved, onCancel }: {
  initial: CardDraft; takenKeys: Set<string>; categories: string[]; canEdit: boolean
  onSaved: (msg: string) => void; onCancel: () => void
}) {
  const [c, setC] = useState<CardDraft>(initial)
  const [busy, setBusy] = useState<'' | 'subiendo' | 'guardando'>('')
  const [error, setError] = useState<string | null>(null)
  const [showHint, setShowHint] = useState(false)
  const isNew = !initial.id
  const set = (p: Partial<CardDraft>) => setC((x) => ({ ...x, ...p }))
  const setD = (p: Partial<CardDraft['display']>) => setC((x) => ({ ...x, display: { ...x.display, ...p } }))
  const setM = (p: Partial<Media>) => setC((x) => (x.display.media ? { ...x, display: { ...x.display, media: { ...x.display.media, ...p } } } : x))
  const m = c.display.media
  // La vista previa muestra la imagen aunque todavía falte su descripción (el juego exige al menos 3 caracteres)
  const previewDisplay = m && m.alt.trim().length < 3 ? { ...c.display, media: { ...m, alt: 'Imagen sin descripción' } } : c.display
  const [fx, fy] = (m?.focus ?? '50% 50%').split(' ').map((v) => parseInt(v, 10))

  const upload = async (file: File | undefined) => {
    if (!file) return
    setError(null); setBusy('subiendo')
    try {
      const base = { alt: m?.alt ?? '', credit: m?.credit ?? DEFAULT_CREDIT, frame: m?.frame ?? 'whatsapp' } as const
      if (file.type.startsWith('video/')) {
        const v = await uploadVideo(file)
        setD({ media: { ...base, kind: 'video', src: v.src, ...(v.poster ? { poster: v.poster } : {}) } })
      } else {
        setD({ media: { ...base, kind: 'image', src: await uploadImage(file), focus: '50% 50%' } })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir el archivo.')
    } finally { setBusy('') }
  }

  const save = async () => {
    setError(null)
    if (m && m.alt.trim().length < 3) { setError('Describe la imagen para quien usa lector de pantalla.'); return }
    const card: CardDraft = { ...c, item_key: isNew ? (c.item_key || keyFromHeadline(c.headline, c.is_real, takenKeys)) : c.item_key }
    setBusy('guardando')
    try {
      const r = await saveCard(card)
      onSaved(isNew ? `Noticia creada (${card.item_key}).` : `Cambios guardados (revisión ${r.revision}).`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally { setBusy('') }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button onClick={onCancel} className="rounded-md border border-soft bg-white px-3 py-1 text-sm hover:bg-lav">← Volver al banco</button>
        <h1 className="font-display text-2xl font-bold">{isNew ? 'Nueva noticia' : 'Editar noticia'}</h1>
      </div>
      <p className="mb-4 rounded-lg bg-lav/60 p-3 text-sm">
        Los cambios quedan en el banco. <b>No cambian la versión que se está jugando</b>: entran cuando armes y actives una versión nueva en «Versiones del juego».
      </p>
      <div className="flex flex-col-reverse gap-5 xl:flex-row xl:items-start">
        <fieldset disabled={!canEdit || !!busy} className="min-w-0 flex-1 space-y-4">
          <Box title="La noticia">
            <F label="Titular (lo que lee el jugador)">
              <textarea className="inp" rows={3} maxLength={300} value={c.headline} onChange={(e) => set({ headline: e.target.value })} />
            </F>
            <div className="flex flex-wrap gap-4" role="radiogroup" aria-label="¿Es real o falsa?">
              <span className="text-xs font-bold text-muted">¿Es real o falsa?</span>
              <label className="flex items-center gap-1.5 text-sm"><input type="radio" checked={c.is_real} onChange={() => set({ is_real: true })} /> Real</label>
              <label className="flex items-center gap-1.5 text-sm"><input type="radio" checked={!c.is_real} onChange={() => set({ is_real: false })} /> Falsa</label>
            </div>
            <F label="Categoría">
              <input className="inp" list="categorias" maxLength={60} value={c.category} onChange={(e) => set({ category: e.target.value })} />
              <datalist id="categorias">{categories.map((x) => <option key={x} value={x} />)}</datalist>
            </F>
          </Box>

          <Box title="Cómo llega">
            <div className="grid gap-3 sm:grid-cols-2">
              <F label="Quién la reenvía"><input className="inp" maxLength={40} placeholder="Tío Fernando" value={c.display.who} onChange={(e) => setD({ who: e.target.value })} /></F>
              <F label="Etiqueta superior"><input className="inp" maxLength={20} placeholder="URGENTE" value={c.display.band} onChange={(e) => setD({ band: e.target.value })} /></F>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={c.display.many} onChange={(e) => setD({ many: e.target.checked })} /> «Reenviado muchas veces»</label>
          </Box>

          <Box title="Imagen o clip">
            <F label={`Subir imagen (JPG, PNG, WebP) o clip MP4 de hasta ${MAX_VIDEO_MB} MB`}>
              <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = '' }} className="text-sm" />
            </F>
            {busy === 'subiendo' && <p role="status" className="text-sm text-muted">Subiendo…</p>}
            <p className="text-xs text-muted">Las imágenes se reducen a 1280 px y se les quitan los datos del archivo (como la ubicación de una foto de celular). Los clips se suben tal cual y sin sonido en el juego.</p>
            {m ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {FRAMES.map(([v, l]) => (
                    <button type="button" key={v} aria-pressed={m.frame === v} onClick={() => setM({ frame: v })}
                      className={`rounded-full border px-3 py-1 text-sm ${m.frame === v ? 'border-u bg-u text-white' : 'border-soft bg-white'}`}>{l}</button>
                  ))}
                </div>
                <F label="Descripción de la imagen (para lectores de pantalla)"><input className="inp" maxLength={300} value={m.alt} onChange={(e) => setM({ alt: e.target.value })} /></F>
                <F label="Aviso sobre la imagen"><input className="inp" maxLength={80} value={m.credit ?? ''} onChange={(e) => setM({ credit: e.target.value || undefined })} /></F>
                {m.kind === 'image' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <F label={`Encuadre horizontal (${fx}%)`}><input type="range" min={0} max={100} value={fx} onChange={(e) => setM({ focus: `${e.target.value}% ${fy}%` })} className="w-full" /></F>
                    <F label={`Encuadre vertical (${fy}%)`}><input type="range" min={0} max={100} value={fy} onChange={(e) => setM({ focus: `${fx}% ${e.target.value}%` })} className="w-full" /></F>
                  </div>
                )}
                <button type="button" onClick={() => setD({ media: undefined })} className="text-sm text-red-700 underline">Quitar imagen y usar la tarjeta de emojis</button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted">Sin imagen, la tarjeta muestra dos emojis sobre un fondo de color, como en la versión 2.0.0.</p>
                <div className="grid grid-cols-2 gap-3">
                  <F label="Emoji grande"><input className="inp" maxLength={8} value={c.display.emo} onChange={(e) => setD({ emo: e.target.value })} /></F>
                  <F label="Emoji pequeño"><input className="inp" maxLength={8} value={c.display.emo2} onChange={(e) => setD({ emo2: e.target.value })} /></F>
                </div>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Fondo">
                  {BACKGROUNDS.map((bg) => (
                    <button type="button" key={bg} role="radio" aria-checked={c.display.bg === bg} aria-label={`Fondo ${BACKGROUNDS.indexOf(bg) + 1}`} onClick={() => setD({ bg })}
                      className={`h-9 w-9 rounded-full ${c.display.bg === bg ? 'ring-3 ring-u ring-offset-2' : ''}`} style={{ background: bg }} />
                  ))}
                </div>
              </>
            )}
          </Box>

          <Box title="Después de responder">
            <F label="Pista de la lupa"><textarea className="inp" rows={2} maxLength={400} value={c.hint} onChange={(e) => set({ hint: e.target.value })} /></F>
            <F label="Explicación (se muestra al responder)"><textarea className="inp" rows={2} maxLength={600} value={c.explanation} onChange={(e) => set({ explanation: e.target.value })} /></F>
            <F label="Señales de alerta (una por línea)">
              <textarea className="inp" rows={3} value={c.red_flags.join('\n')} onChange={(e) => set({ red_flags: e.target.value.split('\n') })} />
            </F>
          </Box>

          <Box title="Fuente y verificación (solo el equipo la ve)">
            <div className="grid gap-3 sm:grid-cols-2">
              <F label="Medio o institución"><input className="inp" value={c.source_name ?? ''} onChange={(e) => set({ source_name: e.target.value || null })} /></F>
              <F label="Fecha de publicación"><input type="date" className="inp" value={c.source_published_on ?? ''} onChange={(e) => set({ source_published_on: e.target.value || null })} /></F>
            </div>
            <F label="Enlace (https://…)"><input type="url" className="inp" value={c.source_url ?? ''} onChange={(e) => set({ source_url: e.target.value || null })} /></F>
            <div className="grid gap-3 sm:grid-cols-2">
              <F label="Estado de verificación">
                <select className="inp" value={c.validation_status} onChange={(e) => set({ validation_status: e.target.value })}>
                  {Object.entries(VALIDATION).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </F>
              <F label="Clave interna">
                <input className="inp font-mono" disabled={!isNew} placeholder={keyFromHeadline(c.headline, c.is_real, takenKeys)} value={c.item_key}
                  onChange={(e) => set({ item_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} />
              </F>
            </div>
            <F label="Notas de verificación"><textarea className="inp" rows={2} value={c.validation_notes ?? ''} onChange={(e) => set({ validation_notes: e.target.value || null })} /></F>
          </Box>

          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          {canEdit ? (
            <div className="flex gap-2">
              <button type="button" onClick={() => void save()} className="rounded-lg bg-u px-5 py-2 font-bold text-white hover:bg-u2 disabled:opacity-50">{busy === 'guardando' ? 'Guardando…' : 'Guardar en el banco'}</button>
              <button type="button" onClick={onCancel} className="rounded-lg border border-soft bg-white px-4 py-2">Cancelar</button>
            </div>
          ) : <p className="text-sm text-muted">Tu rol (viewer) permite ver las noticias, no editarlas.</p>}
        </fieldset>

        <aside className="xl:sticky xl:top-16" aria-label="Vista previa">
          <p className="mb-2 text-xs font-bold text-muted uppercase">Vista previa en el juego</p>
          <div className="relative mx-auto h-[540px] w-[320px] rounded-[28px] bg-[#2B1638] p-3">
            <div className="relative h-full w-full">
              <NewsCard item={{ position: 1, item_id: '00000000-0000-4000-8000-000000000000', headline: c.headline || 'Escribe el titular…', display: previewDisplay }} hint={showHint ? c.hint : undefined} disabled />
            </div>
          </div>
          <label className="mt-2 flex items-center justify-center gap-2 text-sm"><input type="checkbox" checked={showHint} onChange={(e) => setShowHint(e.target.checked)} /> Mostrar la pista</label>
        </aside>
      </div>
    </div>
  )
}

function Box({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-3 rounded-xl border border-black/5 bg-white p-4 shadow-sm"><h2 className="font-display text-lg font-bold">{title}</h2>{children}</section>
}
function F({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-xs font-bold text-muted">{label}<div className="mt-1 font-normal text-ink">{children}</div></label>
}
