import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useData } from '../data'
import { Empty, Section } from '../components'
import { CardEditor } from '../CardEditor'
import { emptyCard, friendlyError, loadBank, loadVersionItems, type BankCard, type CardDraft, type VersionItem } from '../cards'
import { Thumb } from '../Thumb'

export default function Bank() {
  const { data, profile } = useData()
  const canEdit = profile.role !== 'viewer'
  const [cards, setCards] = useState<BankCard[] | null>(null)
  const [items, setItems] = useState<VersionItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [editing, setEditing] = useState<CardDraft | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    try {
      const [b, i] = await Promise.all([loadBank(), loadVersionItems()])
      setCards(b); setItems(i); setError(null)
    } catch {
      setError('No se pudo cargar el banco de noticias. Si acabas de actualizar la plataforma, falta aplicar la migración del banco en Supabase.')
    }
  }, [])
  useEffect(() => { void load() }, [load])

  const active = data?.studies.find((s) => s.status === 'active')
  const inActive = useMemo(() => new Map(items.filter((i) => i.study_id === active?.id).map((i) => [i.item_key, i])), [items, active])
  const categories = useMemo(() => [...new Set(cards?.map((c) => c.category) ?? [])].sort(), [cards])
  const shown = useMemo(() => (cards ?? [])
    .filter((c) => c.archived === showArchived)
    .filter((c) => !q.trim() || `${c.headline} ${c.item_key} ${c.category}`.toLowerCase().includes(q.trim().toLowerCase())), [cards, showArchived, q])

  if (editing) {
    return (
      <CardEditor key={editing.id ?? 'nueva'} initial={editing} takenKeys={new Set(cards?.map((c) => c.item_key))} categories={categories} canEdit={canEdit}
        onCancel={() => setEditing(null)}
        onSaved={(m) => { setEditing(null); setMsg(m); void load() }} />
    )
  }

  const archive = async (c: BankCard, value: boolean) => {
    const { error } = await supabase().rpc('set_news_card_archived', { p_id: c.id, p_archived: value })
    setMsg(error ? friendlyError(error.message) : value ? 'Noticia archivada: ya no aparece al armar versiones nuevas.' : 'Noticia restaurada.')
    void load()
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="flex-1 font-display text-2xl font-bold">Banco de noticias</h1>
        {canEdit && <button onClick={() => { setMsg(null); setEditing(emptyCard()) }} className="rounded-lg bg-u px-4 py-2 font-bold text-white hover:bg-u2">+ Nueva noticia</button>}
      </div>
      {msg && <p role="status" className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-900">{msg}</p>}
      <Section title={showArchived ? 'Noticias archivadas' : 'Noticias disponibles'}
        description={<>Crea o edita noticias aquí. Una noticia puede usarse en varias versiones del juego. Los cambios entran al juego solo cuando armas y activas una versión nueva{active ? <> (la que se juega ahora es la <b>{active.version}</b>)</> : null}.</>}
        actions={
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <input type="search" placeholder="Buscar…" aria-label="Buscar noticias" value={q} onChange={(e) => setQ(e.target.value)} className="inp w-44" />
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Ver archivadas</label>
          </div>
        }>
        {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>
          : !cards ? <p role="status" className="text-sm text-muted">Cargando…</p>
          : !shown.length ? <Empty>{showArchived ? 'No hay noticias archivadas.' : 'No hay noticias que coincidan.'}</Empty>
          : (
            <ul className="divide-y divide-black/5">
              {shown.map((c) => {
                const a = inActive.get(c.item_key)
                const changed = a && a.item_version !== c.revision && a.bank_id === c.id
                return (
                  <li key={c.id} className="flex items-center gap-3 py-2.5">
                    <Thumb display={c.display} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-snug">{c.headline}</p>
                      <p className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-muted">
                        <span className={`rounded-full px-2 py-0.5 font-bold text-white ${c.is_real ? 'bg-real' : 'bg-fake'}`}>{c.is_real ? 'Real' : 'Falsa'}</span>
                        <span>{c.category}</span>·<span className="font-mono">{c.item_key}</span>
                        {a && <span className="rounded-full bg-lav px-2 py-0.5 text-ink">En juego ({active?.version})</span>}
                        {changed && <span className="rounded-full bg-[#FFF6D6] px-2 py-0.5 text-ink">Editada después: el cambio entra en la próxima versión</span>}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 text-sm sm:flex-row sm:gap-3">
                      <button onClick={() => { setMsg(null); setEditing(c) }} className="font-bold text-u underline underline-offset-4">{canEdit ? 'Editar' : 'Ver'}</button>
                      {canEdit && !c.archived && <button onClick={() => { setMsg(null); setEditing({ ...c, id: undefined, item_key: '' }) }} className="text-u underline underline-offset-4">Duplicar</button>}
                      {canEdit && <button onClick={() => void archive(c, !c.archived)} className="text-muted underline underline-offset-4">{c.archived ? 'Restaurar' : 'Archivar'}</button>}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
      </Section>
    </div>
  )
}
