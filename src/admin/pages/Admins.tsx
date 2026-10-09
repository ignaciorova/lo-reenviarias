import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Section, DataTable } from '../components'
import { supabase } from '../../lib/supabase'
import { useData } from '../data'

type AdminRow = { user_id: string; email: string; role: string; display_name: string | null; active: boolean; created_at: string }

export default function Admins() {
  const { profile } = useData()
  const [rows, setRows] = useState<AdminRow[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('viewer')
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase().rpc('list_admins')
    if (error) setMsg({ ok: false, t: 'No se pudo cargar la lista.' }); else setRows(data as AdminRow[])
  }, [])
  useEffect(() => { void load() }, [load])

  const grant = async (e: FormEvent) => {
    e.preventDefault()
    const { error } = await supabase().rpc('grant_admin', { p_email: email.trim(), p_role: role })
    if (error) setMsg({ ok: false, t: error.message.includes('user_not_found') ? 'Esa persona aún no tiene cuenta. Créala en Supabase Auth (invitación) y vuelve a intentarlo.' : 'No se pudo otorgar el rol.' })
    else { setMsg({ ok: true, t: `Rol ${role} otorgado a ${email}.` }); setEmail(''); void load() }
  }
  const revoke = async (id: string) => {
    if (!confirm('¿Revocar el acceso de esta persona?')) return
    const { error } = await supabase().rpc('revoke_admin', { p_user_id: id })
    setMsg(error ? { ok: false, t: 'No se pudo revocar.' } : { ok: true, t: 'Acceso revocado.' })
    void load()
  }

  return (
    <div>
      <h1 className="mb-3 font-display text-2xl font-bold">Gestión de administradores</h1>
      <Section title="Roles" description="owner: todo, incluida la gestión de accesos y la depuración de datos. analyst: lectura, codificación de respuestas y control de calidad. viewer: solo lectura y exportación.">
        {msg && <p role="status" className={`mb-3 rounded-lg p-3 text-sm ${msg.ok ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-800'}`}>{msg.t}</p>}
        <DataTable columns={['Correo', 'Rol', 'Activo', 'Desde', '']} rows={rows.map((r) => [r.email, r.role, r.active ? 'Sí' : 'No', new Date(r.created_at).toLocaleDateString('es-CR'),
          r.active && r.user_id !== profile.user_id ? <button onClick={() => void revoke(r.user_id)} className="text-red-700 underline">Revocar</button> : ''])} />
        <form onSubmit={grant} className="mt-4 flex flex-wrap items-end gap-2">
          <label className="text-sm">Correo de una cuenta existente<input type="email" required className="inp mt-1 w-64" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="text-sm">Rol<select className="inp mt-1 w-36" value={role} onChange={(e) => setRole(e.target.value)}><option value="viewer">viewer</option><option value="analyst">analyst</option><option value="owner">owner</option></select></label>
          <button className="rounded-lg bg-u px-4 py-2 font-bold text-white">Otorgar</button>
        </form>
        <p className="mt-2 text-xs text-muted">La cuenta debe existir en Supabase Auth (Authentication → Users → Invite). El registro público puede desactivarse: sin un rol aquí, una cuenta no ve ningún dato.</p>
      </Section>
    </div>
  )
}
