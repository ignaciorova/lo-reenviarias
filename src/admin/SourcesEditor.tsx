import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Section } from './components'
import { friendlyError, type BankCard, type ConsultSource } from './cards'

const KINDS: [ConsultSource['kind'], string, string][] = [
  ['oficial', '🏛️ Fuente oficial', 'Institución, ministerio, ente regulador.'],
  ['medio', '📰 Medio de noticias', 'Medio con nombre, fecha y enlace.'],
  ['comentarios', '💬 Comentarios en redes', 'Lo que dicen otras personas en un grupo. No cuenta como verificación efectiva.'],
]
const SAYS: [ConsultSource['says'], string][] = [['confirma', 'La confirma'], ['desmiente', 'La desmiente'], ['nada_claro', 'No dice nada claro']]

const blank = (kind: ConsultSource['kind']): ConsultSource =>
  kind === 'comentarios' ? { kind, label: 'Comentarios en el grupo', excerpt: 'Lo que comentan otras personas en un grupo. Nadie cita una fuente.', says: 'nada_claro', simulated: true, comments: [{ who: '', text: '' }] }
    : { kind, label: '', excerpt: '', says: 'nada_claro', url: '', published: '' }

/** Las tres fuentes que el jugador puede consultar al elegir «Verificar primero» (versión 4.x). */
export function SourcesEditor({ card, canEdit, onDone, onCancel }: { card: BankCard; canEdit: boolean; onDone: (msg: string) => void; onCancel: () => void }) {
  const [list, setList] = useState<ConsultSource[]>(() => KINDS.map(([k]) => card.consult_sources?.find((s) => s.kind === k) ?? blank(k)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (i: number, p: Partial<ConsultSource>) => setList((l) => l.map((s, k) => (k === i ? { ...s, ...p } : s)))

  const save = async () => {
    setError(null); setBusy(true)
    // Solo se envían las claves con contenido; los comentarios vacíos se descartan
    const payload = list.map((s) => {
      const o: ConsultSource = { kind: s.kind, label: s.label.trim(), excerpt: s.excerpt.trim(), says: s.says, simulated: !!s.simulated }
      if (s.url?.trim()) o.url = s.url.trim()
      if (s.published?.trim()) o.published = s.published.trim()
      const cs = (s.comments ?? []).filter((c) => c.who.trim() && c.text.trim()).map((c) => ({ who: c.who.trim(), text: c.text.trim() }))
      if (cs.length) o.comments = cs
      return o
    })
    const { error } = await supabase().rpc('save_news_sources', { p_bank_id: card.id, p_sources: payload })
    setBusy(false)
    if (error) { setError(friendlyError(error.message)); return }
    onDone(`Fuentes guardadas para «${card.item_key}». Entran al juego en la próxima versión que armes.`)
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button onClick={onCancel} className="rounded-md border border-soft bg-white px-3 py-1 text-sm hover:bg-lav">← Volver</button>
        <h1 className="font-display text-2xl font-bold">Fuentes para verificar</h1>
      </div>
      <p className="mb-3 rounded-lg bg-lav/60 p-3 text-sm"><b className={card.is_real ? 'text-real' : 'text-fake'}>{card.is_real ? 'Real' : 'Falsa'}</b> · {card.headline}</p>
      <p className="mb-4 max-w-3xl text-sm text-muted">Al elegir «Verificar primero», el jugador abre una de estas fuentes, la lee y dice qué dice. «Qué dice» es la respuesta correcta para medir la verificación efectiva: el jugador nunca la ve. Usa extractos fieles de fuentes que existan; si algo no se pudo comprobar, márcalo como «no dice nada claro» y anótalo en el expediente.</p>
      {list.map((s, i) => {
        const [, title, help] = KINDS[i]
        return (
          <Section key={s.kind} title={title} description={help}>
            <fieldset disabled={!canEdit} className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-muted">Nombre que ve el jugador<input className="inp mt-1 font-normal text-ink" maxLength={80} value={s.label} onChange={(e) => set(i, { label: e.target.value })} /></label>
                {s.kind !== 'comentarios' && <label className="text-xs font-bold text-muted">Enlace (https://)<input className="inp mt-1 font-normal text-ink" value={s.url ?? ''} onChange={(e) => set(i, { url: e.target.value })} /></label>}
              </div>
              <label className="text-xs font-bold text-muted">Extracto que se muestra ({s.excerpt.length}/600)
                <textarea className="inp mt-1 font-normal text-ink" rows={3} maxLength={600} value={s.excerpt} onChange={(e) => set(i, { excerpt: e.target.value })} />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <fieldset>
                  <legend className="text-xs font-bold text-muted">Qué dice sobre la noticia (respuesta correcta)</legend>
                  <div className="mt-1 flex flex-wrap gap-3 text-sm">
                    {SAYS.map(([v, l]) => <label key={v} className="flex items-center gap-1.5"><input type="radio" name={`says-${s.kind}`} checked={s.says === v} onChange={() => set(i, { says: v })} />{l}</label>)}
                  </div>
                </fieldset>
                {s.kind !== 'comentarios' && <label className="text-xs font-bold text-muted">Fecha de publicación (AAAA-MM-DD, opcional)<input className="inp mt-1 font-normal text-ink" value={s.published ?? ''} onChange={(e) => set(i, { published: e.target.value })} /></label>}
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!s.simulated} onChange={(e) => set(i, { simulated: e.target.checked })} /> Contenido simulado para el juego (se indica al jugador)</label>
              {s.kind === 'comentarios' && (
                <div>
                  <p className="text-xs font-bold text-muted">Comentarios (hasta 4; nombres inventados, sin personas reales)</p>
                  {(s.comments ?? []).map((c, k) => (
                    <div key={k} className="mt-1 grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
                      <input aria-label={`Quién comenta ${k + 1}`} className="inp" placeholder="Tía Rosa" value={c.who} onChange={(e) => set(i, { comments: s.comments!.map((x, j) => (j === k ? { ...x, who: e.target.value } : x)) })} />
                      <input aria-label={`Comentario ${k + 1}`} className="inp" value={c.text} onChange={(e) => set(i, { comments: s.comments!.map((x, j) => (j === k ? { ...x, text: e.target.value } : x)) })} />
                      <button type="button" onClick={() => set(i, { comments: s.comments!.filter((_, j) => j !== k) })} className="text-sm text-muted underline">Quitar</button>
                    </div>
                  ))}
                  {(s.comments?.length ?? 0) < 4 && <button type="button" onClick={() => set(i, { comments: [...(s.comments ?? []), { who: '', text: '' }] })} className="mt-1 text-sm text-u underline">+ Comentario</button>}
                </div>
              )}
            </fieldset>
          </Section>
        )
      })}
      {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {canEdit ? (
        <div className="flex gap-2">
          <button disabled={busy} onClick={() => void save()} className="rounded-lg bg-u px-5 py-2 font-bold text-white hover:bg-u2 disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar fuentes'}</button>
          <button onClick={onCancel} className="rounded-lg border border-soft bg-white px-4 py-2">Cancelar</button>
        </div>
      ) : <p className="text-sm text-muted">Tu rol (viewer) permite ver, no editar.</p>}
    </div>
  )
}
