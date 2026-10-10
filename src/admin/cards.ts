import { supabase } from '../lib/supabase'
import type { Media } from '../game/MediaFrame'

/** Aspecto de la tarjeta tal como lo guarda la base (news_bank.display / news_items.display). */
export type CardDisplay = {
  who: string; many: boolean; band: string; bg: string; emo: string; emo2: string
  src_label?: string
  media?: Media
}

export type BankCard = {
  id: string; item_key: string; revision: number; headline: string; body_text: string | null; is_real: boolean; category: string
  source_name: string | null; source_url: string | null; source_published_on: string | null; explanation: string; hint: string
  red_flags: string[]; display: CardDisplay; validation_status: string; validation_notes: string | null; archived: boolean
  updated_at: string
}
export type CardDraft = Omit<BankCard, 'id' | 'revision' | 'archived' | 'updated_at'> & { id?: string }

export type VersionItem = { id: string; study_id: string; item_key: string; item_version: number; bank_id: string | null; headline: string; is_real: boolean; display: CardDisplay }

export const VALIDATION: Record<string, string> = {
  pendiente: 'Pendiente', verificada: 'Verificada', requiere_precision: 'Requiere precisión', requiere_correccion: 'Requiere corrección', ficticia_documentada: 'Ficticia documentada',
}

/** Fondos de la tarjeta sin imagen (los mismos de las noticias originales). */
export const BACKGROUNDS = [
  'linear-gradient(135deg,#1F3B73,#B22234)', 'linear-gradient(135deg,#2F7D32,#A5D6A7)', 'linear-gradient(135deg,#0B3D91,#CF142B)',
  'linear-gradient(135deg,#F2994A,#F2C94C)', 'linear-gradient(135deg,#3E2723,#8D6E63)', 'linear-gradient(135deg,#33691E,#827717)',
  'linear-gradient(135deg,#00695C,#4DB6AC)', 'linear-gradient(135deg,#0277BD,#81D4FA)', 'linear-gradient(135deg,#4A148C,#9575CD)',
]

export const DEFAULT_CREDIT = 'Imagen ilustrativa · juego académico'

export function emptyCard(): CardDraft {
  return {
    item_key: '', headline: '', body_text: null, is_real: false, category: '', source_name: null, source_url: null, source_published_on: null,
    explanation: '', hint: '', red_flags: [], validation_status: 'pendiente', validation_notes: null,
    display: { who: '', many: true, band: '', bg: BACKGROUNDS[0], emo: '📰', emo2: '❓' },
  }
}

/** Clave interna a partir del titular: r_/f_ + primeras palabras, sin tildes. Solo se usa en el panel y en los datos. */
export function keyFromHeadline(headline: string, isReal: boolean, taken: Set<string>): string {
  const slug = headline.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((w) => w.length > 3).slice(0, 3).join('_') || 'noticia'
  const base = `${isReal ? 'r' : 'f'}_${slug}`.slice(0, 36)
  let k = base, i = 2
  while (taken.has(k)) k = `${base}_${i++}`
  return k
}

/** Mensajes de la base traducidos para el equipo. */
export function friendlyError(message: string): string {
  const map: [string, string][] = [
    ['forbidden', 'Tu rol no permite esta acción.'],
    ['duplicate key', 'Ya existe una noticia con esa clave interna. Cámbiala.'],
    ['pocas_noticias', 'Hacen falta al menos 10 noticias.'],
    ['faltan_reales_o_falsas', 'Incluye noticias reales y falsas.'],
    ['version_existente', 'Ese número de versión ya existe. Usa otro.'],
    ['version_invalida', 'El número de versión debe tener la forma 3.1.0.'],
    ['falta_nota_de_cambios', 'Escribe una nota de cambios (al menos 10 caracteres).'],
    ['tarjeta_archivada', 'Una de las noticias elegidas está archivada.'],
    ['medio_archivo_invalido', 'La imagen o el clip no son válidos. Vuelve a subirlos.'],
    ['medio_descripcion_invalida', 'Describe la imagen en al menos 3 caracteres.'],
    ['remitente_invalido', 'Escribe quién lo reenvía (hasta 40 caracteres).'],
    ['banda_invalida', 'Escribe la etiqueta superior (hasta 20 caracteres).'],
    ['emoji_invalido', 'Elige los dos emojis de la tarjeta.'],
    ['headline', 'El titular debe tener entre 5 y 300 caracteres.'],
    ['explanation', 'La explicación debe tener entre 3 y 600 caracteres.'],
    ['hint', 'La pista debe tener entre 3 y 400 caracteres.'],
    ['category', 'Escribe una categoría.'],
    ['item_key', 'La clave interna solo admite minúsculas, números y guion bajo.'],
    ['source_url', 'El enlace de la fuente debe empezar con https://'],
    ['la_1_0_0_es_historica', 'La 1.0.0 es el registro histórico y no se puede activar.'],
  ]
  return map.find(([k]) => message.includes(k))?.[1] ?? 'No se pudo guardar. Revisa los campos e inténtalo otra vez.'
}

export async function loadBank(): Promise<BankCard[]> {
  const { data, error } = await supabase().from('news_bank').select('*').order('updated_at', { ascending: false })
  if (error) throw error
  return data as BankCard[]
}

export async function loadVersionItems(): Promise<VersionItem[]> {
  const { data, error } = await supabase().from('news_items').select('id,study_id,item_key,item_version,bank_id,headline,is_real,display').order('item_key')
  if (error) throw error
  return data as VersionItem[]
}

export async function saveCard(card: CardDraft): Promise<{ id: string; revision: number }> {
  const { data, error } = await supabase().rpc('save_news_card', { p_card: card })
  if (error) throw new Error(friendlyError(error.message))
  return data as { id: string; revision: number }
}

// ---------------------------------------------------------------------------
// Subida de archivos al bucket «noticias». Nombre aleatorio: nunca se sobrescribe nada.
// ---------------------------------------------------------------------------
const MAX_SIDE = 1280
export const MAX_VIDEO_MB = 10

async function put(blob: Blob, ext: 'jpg' | 'mp4', contentType: string): Promise<string> {
  const name = `${crypto.randomUUID()}.${ext}`
  const { error } = await supabase().storage.from('noticias').upload(name, blob, { contentType, upsert: false, cacheControl: '31536000' })
  if (error) throw new Error('No se pudo subir el archivo. Revisa tu conexión y tu rol.')
  return `/storage/v1/object/public/noticias/${name}`
}

function toJpeg(source: CanvasImageSource, w: number, h: number): Promise<Blob> {
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h))
  const c = document.createElement('canvas')
  c.width = Math.round(w * scale); c.height = Math.round(h * scale)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(source, 0, 0, c.width, c.height)
  return new Promise((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error('No se pudo procesar la imagen.'))), 'image/jpeg', 0.85))
}

/**
 * Imagen: se redibuja en el navegador a JPEG de 1280 px como máximo. Así pesa poco y se descartan los
 * metadatos del archivo original (por ejemplo, la ubicación GPS de una foto de celular).
 */
export async function uploadImage(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Usa una imagen JPG, PNG o WebP.')
  const bmp = await createImageBitmap(file)
  const blob = await toJpeg(bmp, bmp.width, bmp.height)
  bmp.close()
  return put(blob, 'jpg', 'image/jpeg')
}

/** Clip: MP4 de hasta 10 MB, se sube tal cual; la portada (lo que se ve con «reducir movimiento») se toma del segundo 0,5. */
export async function uploadVideo(file: File): Promise<{ src: string; poster?: string }> {
  if (file.type !== 'video/mp4') throw new Error('Usa un clip MP4.')
  if (file.size > MAX_VIDEO_MB * 1024 * 1024) throw new Error(`El clip pesa más de ${MAX_VIDEO_MB} MB. Recórtalo o comprímelo.`)
  const src = await put(file, 'mp4', 'video/mp4')
  const poster = await videoPoster(file).then((b) => put(b, 'jpg', 'image/jpeg')).catch(() => undefined)
  return { src, poster }
}

function videoPoster(file: File): Promise<Blob> {
  return new Promise((ok, fail) => {
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url
    const done = (f: () => void) => { URL.revokeObjectURL(url); f() }
    v.onloadeddata = () => { v.currentTime = Math.min(0.5, (v.duration || 1) / 2) }
    v.onseeked = () => { toJpeg(v, v.videoWidth, v.videoHeight).then((b) => done(() => ok(b)), (e) => done(() => fail(e))) }
    v.onerror = () => done(() => fail(new Error('No se pudo leer el clip.')))
  })
}

/** Siguiente número de versión sugerido: sube el segundo número de la más alta (3.0.0 → 3.1.0). */
export function nextVersion(versions: string[]): string {
  const top = versions.map((v) => v.split('.').map(Number)).sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2])[0] ?? [1, 0, 0]
  return `${top[0]}.${top[1] + 1}.0`
}
