import { useMemo, useState } from 'react'
import { formatCode, localCode, newCode } from '../../lib/surveyCode'
import { Logo, PrimaryButton } from '../ui'

/**
 * /codigo — la encuesta (Google Forms) enlaza aquí para que la persona obtenga su código seudónimo.
 * El código se genera en este teléfono, se guarda solo aquí y no identifica a nadie.
 * Si la persona después juega en este mismo teléfono, el juego le ofrece usarlo.
 */
export default function CodePage() {
  const code = useMemo(() => {
    const c = localCode.get() ?? newCode()
    localCode.set(c)
    return c
  }, [])
  const [copied, setCopied] = useState<string | null>(null)
  const copy = async () => {
    try { await navigator.clipboard.writeText(formatCode(code)); setCopied('Copiado') } catch { setCopied('Cópialo a mano') }
  }
  return (
    <div className="min-h-dvh bg-u3 text-white">
      <main className="mx-auto flex min-h-dvh max-w-[520px] flex-col gap-5 px-5 pt-[calc(22px+env(safe-area-inset-top,0px))] pb-9">
        <Logo tag={<>Radiografía Social<br />Ética</>} />
        <h1 className="font-display text-[38px] leading-tight font-extrabold">Tu código para la encuesta</h1>
        <div className="rounded-[20px] bg-white p-5 text-center text-ink">
          <p className="font-mono text-[44px] font-bold tracking-[.12em] tabular" aria-label={`Código ${formatCode(code).split('').join(' ')}`}>{formatCode(code)}</p>
          <button onClick={() => void copy()} className="mt-2 rounded-xl border-2 border-u px-4 py-2 font-bold">{copied ?? 'Copiar código'}</button>
        </div>
        <ol className="list-decimal space-y-2 pl-5 text-[17px]">
          <li>Escríbelo en la encuesta, en la pregunta «Código del juego».</li>
          <li>Al terminar la encuesta, entra al juego desde este mismo teléfono: te ofrecerá usar este código.</li>
        </ol>
        <p className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm">
          El código es al azar: no tiene tu nombre ni ningún dato tuyo. Sirve solo para unir tus respuestas de la encuesta con tu partida. Es opcional.
        </p>
        <PrimaryButton alt onClick={() => (history.length > 1 ? history.back() : window.close())}>Volver a la encuesta</PrimaryButton>
      </main>
    </div>
  )
}
