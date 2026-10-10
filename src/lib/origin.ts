/** Origen de la visita según ?origen= (QR del juego, enlace compartido…). Solo describe el canal; no identifica a nadie. */
export function entryOrigin(search: string): 'encuesta' | 'qr_juego' | 'enlace' | 'otro' | null {
  const o = new URLSearchParams(search).get('origen')
  if (!o) return null
  return o === 'encuesta' || o === 'qr_juego' || o === 'enlace' ? o : 'otro'
}
