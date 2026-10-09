import { useEffect, useRef, useState } from 'react'
import type { SummaryT } from '../lib/api'
import { Logo, PrimaryButton } from './ui'

export function rankFor(ok: number): [string, string, string] {
  if (ok >= 9) return ['🏆', 'Detector experto', 'Casi nadie te engaña. Igual, la mejor defensa sigue siendo verificar.']
  if (ok >= 7) return ['🥈', 'Buen olfato', 'Detectaste la mayoría, pero algunas se colaron. Basta un descuido para difundir un bulo.']
  if (ok >= 5) return ['🤔', 'En la cuerda floja', 'La mitad te generó dudas. Es normal: los titulares falsos están hechos para parecer reales.']
  return ['📢', 'Reenviador frecuente', 'Varias se te colaron. No es falta de inteligencia: los bulos juegan con nuestras emociones.']
}

export function FinalScreen({ summary, reducedMotion, onNewPerson }: { summary: SummaryT; reducedMotion: boolean; onNewPerson: () => void }) {
  const [medal, rank, msg] = rankFor(summary.correct_count)
  const [shareLabel, setShareLabel] = useState('Retar a un amigo')
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (reducedMotion || summary.correct_count < 7 || !canvas.current) return
    const cv = canvas.current, ctx = cv.getContext('2d')
    if (!ctx) return
    cv.width = innerWidth; cv.height = innerHeight
    const cols = ['#F5C842', '#1E9E63', '#E0443F', '#FFFFFF', '#9575CD']
    const ps = Array.from({ length: 140 }, () => ({ x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * 0.5, v: 2 + Math.random() * 4, r: Math.random() * 6, c: cols[Math.floor(Math.random() * 5)], s: Math.random() * 0.2 - 0.1 }))
    const t0 = performance.now()
    let raf = 0
    const f = (t: number) => {
      ctx.clearRect(0, 0, cv.width, cv.height)
      for (const p of ps) { p.y += p.v; p.x += Math.sin(p.y / 30) * 1.5; p.r += p.s; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-4, -7, 8, 14); ctx.restore() }
      if (t - t0 < 3500) raf = requestAnimationFrame(f); else ctx.clearRect(0, 0, cv.width, cv.height)
    }
    raf = requestAnimationFrame(f)
    return () => cancelAnimationFrame(raf)
  }, [reducedMotion, summary.correct_count])

  const share = async () => {
    const url = `${location.origin}/`
    const text = `Saqué ${summary.correct_count}/10 en "¿Lo reenviarías?" 🕵️ ¿Distingues las noticias falsas de Costa Rica?`
    if (navigator.share) { try { await navigator.share({ title: '¿Lo reenviarías?', text, url }) } catch { /* cancelado */ } }
    else { try { await navigator.clipboard.writeText(`${text} ${url}`); setShareLabel('Enlace copiado') } catch { setShareLabel('No se pudo copiar') } }
  }

  return (
    <main className="mx-auto max-w-[520px] px-5 pt-[calc(22px+env(safe-area-inset-top,0px))] pb-9">
      <canvas ref={canvas} aria-hidden className="pointer-events-none fixed inset-0 z-30" />
      <Logo tag="Tu resultado" />
      <div aria-hidden className="my-1.5 text-[84px] leading-none">{medal}</div>
      <h1 className="font-display text-[clamp(40px,11vw,62px)] leading-none font-extrabold">{rank}</h1>
      <p className="mt-2 text-lg">{msg}</p>
      <div className="my-4 grid grid-cols-3 gap-2">
        <Stat v={`${summary.correct_count}/${summary.decisions_count}`} l="aciertos" />
        <Stat v={String(summary.score ?? '–')} l="puntos" />
        <Stat v={summary.percentile !== null ? `${summary.percentile}%` : '–'} l={summary.percentile !== null ? 'superaste' : 'aún pocos datos'} />
      </div>
      {summary.simulated_reach_total > 0 && (
        <div className="my-3 rounded-2xl bg-[#FDECEC] p-3.5 text-ink">
          Entre todas las falsas que creíste, tus reenvíos habrían podido llegar a
          <b className="block font-display text-[34px] leading-none text-fake tabular">{summary.simulated_reach_total.toLocaleString('es-CR')}</b>
          personas.<small className="mt-1 block text-xs text-muted">Simulación ilustrativa, no es un dato real de difusión.</small>
        </div>
      )}
      <ul className="my-3.5 list-none p-0">
        {summary.recap.map((r, i) => (
          <li key={i} className="flex gap-2.5 border-b border-white/15 py-2.5 text-sm">
            <span aria-label={r.is_correct ? 'Acierto' : r.timed_out ? 'Tiempo agotado' : 'Error'}>{r.is_correct ? '✅' : r.timed_out ? '⏱️' : '❌'}</span>
            <span>{r.headline.length > 72 ? `${r.headline.slice(0, 72)}…` : r.headline} <b>{r.is_real ? 'Real' : 'Falsa'}</b>{r.hint_used ? ' 🔍' : ''}</span>
          </li>
        ))}
      </ul>
      <div className="my-4 rounded-[20px] bg-white p-[18px] text-ink">
        <h2 className="mb-2 font-display text-[22px] font-bold">Antes de reenviar, pregúntate</h2>
        <ol className="list-decimal pl-5">
          <li>¿Quién lo dice? ¿Hay un medio o institución con nombre?</li>
          <li>¿Aparece en otro medio confiable?</li>
          <li>¿Me quiere asustar, enojar o apurar?</li>
          <li>¿Me piden "pásalo" o hacer clic en un enlace raro?</li>
        </ol>
      </div>
      <PrimaryButton onClick={() => void share()}>{shareLabel}</PrimaryButton>
      <p className="mt-3 text-center text-sm text-[#CFC3DA]" role="status">Tu respuesta anónima quedó guardada. ¡Gracias por participar!</p>
      <button onClick={onNewPerson} className="mx-auto mt-6 block text-sm text-[#CFC3DA] underline underline-offset-4">¿Compartes este dispositivo? Iniciar partida para otra persona</button>
    </main>
  )
}

function Stat({ v, l }: { v: string; l: string }) {
  return <div className="rounded-2xl bg-u p-3 text-center"><b className="block font-display text-[30px] leading-tight tabular">{v}</b><span className="text-xs text-[#CFC3DA]">{l}</span></div>
}
