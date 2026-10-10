import { useEffect, useState } from 'react'
import { api, type LbRowT } from '../lib/api'
import { aliasText, randomAlias, type AliasPick } from './aliases'

/**
 * Tabla de puntuación semanal (solo en versiones que la tengan activada). Entrar es opcional y se hace
 * al final, con un apodo armado de listas fijas: nada de nombres ni texto libre.
 */
export function Leaderboard({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<{ canJoin: boolean; top: LbRowT[] } | null>(null)
  const [picking, setPicking] = useState(false)
  const [pick, setPick] = useState<AliasPick>(() => randomAlias())
  const [mine, setMine] = useState<{ alias: string; rank: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api.leaderboardStatus(sessionId)
      .then((s) => { if (alive && s.enabled) setState({ canJoin: !!s.can_join, top: s.top ?? [] }) })
      .catch(() => { /* sin tabla: la pantalla final sigue igual */ })
    return () => { alive = false }
  }, [sessionId])

  if (!state) return null

  const join = async () => {
    setBusy(true); setError(null)
    try {
      const r = await api.joinLeaderboard(sessionId, pick.animal, pick.adj, pick.num)
      setMine({ alias: r.alias, rank: r.rank }); setState({ canJoin: false, top: r.top }); setPicking(false)
    } catch {
      setError('No se pudo guardar. Inténtalo de nuevo.')
    } finally { setBusy(false) }
  }

  return (
    <section aria-labelledby="lb-title" className="my-4 rounded-[20px] bg-white p-[18px] text-ink">
      <h2 id="lb-title" className="font-display text-[22px] font-bold">🏆 Tabla de la semana</h2>
      {mine && <p role="status" className="mt-1 rounded-xl bg-[#E8F5E9] p-2.5 text-sm">¡Listo, <b>{mine.alias}</b>! Vas en el puesto <b>{mine.rank}</b> de esta semana.</p>}
      {state.top.length === 0 ? <p className="mt-1 text-sm text-muted">Nadie ha entrado todavía esta semana. ¡Puedes ser la primera persona!</p> : (
        <ol className="mt-2 divide-y divide-black/5">
          {state.top.map((r) => (
            <li key={r.rank + r.alias} className={`flex items-center gap-2 py-1.5 text-sm ${mine?.alias === r.alias ? 'font-bold' : ''}`}>
              <span className="w-6 text-right text-muted tabular">{r.rank}.</span>
              <span className="flex-1">{r.alias}</span>
              <span className="text-muted tabular">{r.correct}/10</span>
              <b className="w-14 text-right tabular">{r.score.toLocaleString('es-CR')}</b>
            </li>
          ))}
        </ol>
      )}
      {state.canJoin && !picking && (
        <button onClick={() => setPicking(true)} className="mt-3 w-full rounded-full border-2 border-u py-2.5 font-bold text-u">Entrar a la tabla (opcional)</button>
      )}
      {picking && (
        <div className="mt-3 rounded-xl bg-lav/60 p-3">
          <p className="text-sm">Tu apodo:</p>
          <p className="my-1 font-display text-2xl font-bold" aria-live="polite">{aliasText(pick)}</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setPick(randomAlias())} className="rounded-full border border-soft bg-white px-4 py-2 text-sm">🎲 Otro</button>
            <button disabled={busy} onClick={() => void join()} className="rounded-full bg-u px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Guardando…' : 'Publicar'}</button>
            <button onClick={() => setPicking(false)} className="px-2 py-2 text-sm text-muted underline">Mejor no</button>
          </div>
          {error && <p role="alert" className="mt-2 text-sm text-fake">{error}</p>}
          <p className="mt-2 text-xs text-muted">Se publican solo el apodo y tus puntos de esta semana. No se pueden relacionar con tus respuestas.</p>
        </div>
      )}
    </section>
  )
}
