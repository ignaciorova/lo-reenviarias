// Código seudónimo para enlazar la encuesta (Google Forms) con la partida, sin datos personales.
// 7 caracteres al azar en base 32 de Crockford (sin I, L, O ni U, para que no se confundan) + 1 de control.
// La misma regla está en public._survey_code_ok (SQL); si cambia una, debe cambiar la otra.

const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function check(seven: string): string {
  let s = 0
  for (let i = 0; i < 7; i++) s += (i + 1) * ALPHA.indexOf(seven[i])
  return ALPHA[s % 32]
}

/** Quita guiones y espacios, pasa a mayúsculas y corrige las letras que se confunden (O→0, I/L→1). */
export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1')
}

export function isValidCode(raw: string): boolean {
  const c = normalizeCode(raw)
  return /^[0-9A-HJKMNP-TV-Z]{8}$/.test(c) && check(c.slice(0, 7)) === c[7]
}

export function newCode(): string {
  const b = globalThis.crypto.getRandomValues(new Uint8Array(7))
  const seven = [...b].map((x) => ALPHA[x % 32]).join('')
  return seven + check(seven)
}

/** «K7Q4MXPZ» → «K7Q4-MXPZ» para leerlo y copiarlo. */
export function formatCode(c: string): string {
  const n = normalizeCode(c)
  return n.length === 8 ? `${n.slice(0, 4)}-${n.slice(4)}` : n
}

// El código vive solo en este teléfono (localStorage). No sale de aquí salvo que la persona lo use.
const KEY = 'lr_survey_code'
export const localCode = {
  get(): string | null {
    try { const v = localStorage.getItem(KEY); return v && isValidCode(v) ? normalizeCode(v) : null } catch { return null }
  },
  set(c: string) { try { localStorage.setItem(KEY, normalizeCode(c)) } catch { /* modo privado */ } },
  clear() { try { localStorage.removeItem(KEY) } catch { /* noop */ } },
}

/**
 * Enlace a la encuesta con el código ya escrito (enlace prellenado de Google Forms).
 * surveyUrl: https://docs.google.com/forms/d/e/<id>/viewform · entry: «entry.123456789» (campo del código).
 * Si falta el campo del código, se abre la encuesta sin prellenar.
 */
export function surveyLink(surveyUrl: string, entry: string | null | undefined, code: string | null): string {
  const u = new URL(surveyUrl)
  if (entry && code && /^entry\.\d{3,15}$/.test(entry) && u.hostname === 'docs.google.com') {
    u.searchParams.set('usp', 'pp_url')
    u.searchParams.set(entry, formatCode(code))
  }
  return u.toString()
}

/** Origen de la visita según ?origen= (QR de la encuesta, QR del juego, enlace…). */
export function entryOrigin(search: string): 'encuesta' | 'qr_juego' | 'enlace' | 'otro' | null {
  const o = new URLSearchParams(search).get('origen')
  if (!o) return null
  return o === 'encuesta' || o === 'qr_juego' || o === 'enlace' ? o : 'otro'
}
