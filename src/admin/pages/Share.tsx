import { useMemo, useState } from 'react'
import { encode } from 'uqr'
import { Section } from '../components'
import { download } from '../../analytics/export'

const MARGIN = 4

/** Enlace y código QR de la aplicación pública, para proyectar o imprimir. */
export default function Share() {
  const url = `${window.location.origin}/`
  const [copied, setCopied] = useState(false)
  const qr = useMemo(() => encode(url, { ecc: 'M', border: 0 }), [url])
  const dim = qr.size + MARGIN * 2
  const path = useMemo(() => {
    let d = ''
    qr.data.forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${x + MARGIN} ${y + MARGIN}h1v1h-1z` }))
    return d
  }, [qr])
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges"><rect width="${dim}" height="${dim}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`

  const png = () => {
    const scale = 24, c = document.createElement('canvas')
    c.width = c.height = dim * scale
    const g = c.getContext('2d')!
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#000'
    qr.data.forEach((row, y) => row.forEach((on, x) => { if (on) g.fillRect((x + MARGIN) * scale, (y + MARGIN) * scale, scale, scale) }))
    c.toBlob((b) => { if (b) download('lo-reenviarias-qr.png', b, 'image/png') })
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { setCopied(false) }
  }

  return (
    <div>
      <h1 className="mb-3 font-display text-2xl font-bold">Compartir el juego</h1>
      <Section title="Enlace público" description="Las personas participan sin cuenta. El panel (/admin) no aparece en ningún lugar de la aplicación pública.">
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded bg-lav px-3 py-2 text-sm break-all">{url}</code>
          <button onClick={() => void copy()} className="rounded-lg bg-u px-3 py-2 text-sm font-bold text-white">{copied ? 'Copiado' : 'Copiar enlace'}</button>
        </div>
      </Section>
      <Section title="Código QR" description="Para proyectar en clase o imprimir en afiches. Pruébelo con un teléfono antes de usarlo.">
        <div className="flex flex-wrap items-end gap-5">
          <svg role="img" aria-label={`Código QR que abre ${url}`} viewBox={`0 0 ${dim} ${dim}`} shapeRendering="crispEdges" className="h-56 w-56 rounded-lg border border-soft">
            <rect width={dim} height={dim} fill="#fff" />
            <path d={path} fill="#000" />
          </svg>
          <div className="flex flex-col gap-2">
            <button onClick={png} className="rounded-lg border border-u px-3 py-2 text-sm font-bold text-u">Descargar PNG</button>
            <button onClick={() => download('lo-reenviarias-qr.svg', svg, 'image/svg+xml')} className="rounded-lg border border-u px-3 py-2 text-sm font-bold text-u">Descargar SVG</button>
          </div>
        </div>
      </Section>
    </div>
  )
}
