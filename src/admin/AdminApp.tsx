import { useEffect, useState, type FormEvent } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { isConfigured, supabase } from '../lib/supabase'
import { DataContext, useData, useResearchDataState, type AdminProfile } from './data'
import { FilterBar } from './components'
import Dashboard from './pages/Dashboard'
import Explorer from './pages/Explorer'
import Items from './pages/Items'
import Behavior from './pages/Behavior'
import Lab from './pages/Lab'
import OpenResponses from './pages/OpenResponses'
import Share from './pages/Share'
import Exports from './pages/Exports'
import Quality from './pages/Quality'
import Methodology from './pages/Methodology'
import Admins from './pages/Admins'

export default function AdminApp() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [profile, setProfile] = useState<AdminProfile | null | undefined>(undefined)
  // El enlace de «Olvidé mi contraseña» abre /admin con una sesión de recuperación: hay que pedir la nueva contraseña.
  const [recovering, setRecovering] = useState(() => location.hash.includes('type=recovery'))

  useEffect(() => {
    document.title = 'Panel de investigación · ¿Lo reenviarías?'
    if (!isConfigured) { setSession(null); return }
    const sb = supabase()
    sb.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = sb.auth.onAuthStateChange((e, s) => {
      if (e === 'PASSWORD_RECOVERY') setRecovering(true)
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setProfile(session === null ? null : undefined); return }
    supabase().rpc('my_admin_profile').then(({ data, error }) => setProfile(error ? null : (data as AdminProfile | null)))
  }, [session])

  return (
    <div className="admin min-h-dvh bg-[#F7F6F9] font-body text-[15px] text-ink">
      {session === undefined || (session && profile === undefined) ? (
        <div className="grid min-h-dvh place-items-center text-muted">Verificando acceso…</div>
      ) : !session ? (
        <Login />
      ) : recovering ? (
        <SetPassword email={session.user.email ?? ''} onDone={() => setRecovering(false)} />
      ) : !profile ? (
        <NoAccess email={session.user.email ?? ''} />
      ) : (
        <Shell profile={profile} email={session.user.email ?? ''} />
      )}
    </div>
  )
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setMsg(null)
    const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setMsg({ kind: 'error', text: 'Correo o contraseña incorrectos, o la cuenta no está confirmada.' })
  }
  const reset = async () => {
    if (!email.trim()) { setMsg({ kind: 'error', text: 'Escribe tu correo primero.' }); return }
    setBusy(true)
    const { error } = await supabase().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/admin` })
    setBusy(false)
    setMsg(error ? { kind: 'error', text: 'No se pudo enviar el correo de recuperación.' } : { kind: 'ok', text: 'Si la cuenta existe, recibirás un enlace para restablecer la contraseña.' })
  }
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
        <img src="/ulacit-logo.png" alt="ULACIT" className="mb-4 h-9" />
        <h1 className="font-display text-2xl font-bold">Panel de investigación</h1>
        <p className="mb-5 text-sm text-muted">Acceso restringido al equipo del estudio «¿Lo reenviarías?».</p>
        {!isConfigured && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">La aplicación no está configurada.</p>}
        <label className="mb-1 block text-sm font-bold" htmlFor="email">Correo</label>
        <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className="mb-3 w-full rounded-lg border border-soft px-3 py-2.5" />
        <label className="mb-1 block text-sm font-bold" htmlFor="pw">Contraseña</label>
        <input id="pw" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mb-4 w-full rounded-lg border border-soft px-3 py-2.5" />
        {msg && <p role={msg.kind === 'error' ? 'alert' : 'status'} className={`mb-3 rounded-lg p-3 text-sm ${msg.kind === 'error' ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>{msg.text}</p>}
        <button disabled={busy || !isConfigured} className="w-full rounded-lg bg-u py-2.5 font-bold text-white hover:bg-u2 disabled:opacity-50">{busy ? 'Ingresando…' : 'Ingresar'}</button>
        <button type="button" onClick={() => void reset()} className="mt-3 w-full text-sm text-u underline underline-offset-4">Olvidé mi contraseña</button>
      </form>
    </main>
  )
}

function SetPassword({ email, onDone }: { email: string; onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 12) { setMsg('La contraseña debe tener al menos 12 caracteres.'); return }
    if (password !== confirm) { setMsg('Las contraseñas no coinciden.'); return }
    setBusy(true); setMsg(null)
    const { error } = await supabase().auth.updateUser({ password })
    setBusy(false)
    if (error) { setMsg('No se pudo guardar la contraseña. Pide un enlace nuevo e inténtalo otra vez.'); return }
    history.replaceState(null, '', location.pathname)
    onDone()
  }
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
        <h1 className="font-display text-2xl font-bold">Nueva contraseña</h1>
        <p className="mb-5 text-sm text-muted">Para la cuenta <b>{email}</b>.</p>
        <label className="mb-1 block text-sm font-bold" htmlFor="new-pw">Contraseña nueva</label>
        <input id="new-pw" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mb-3 w-full rounded-lg border border-soft px-3 py-2.5" />
        <label className="mb-1 block text-sm font-bold" htmlFor="new-pw2">Repítela</label>
        <input id="new-pw2" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mb-4 w-full rounded-lg border border-soft px-3 py-2.5" />
        {msg && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{msg}</p>}
        <button disabled={busy} className="w-full rounded-lg bg-u py-2.5 font-bold text-white hover:bg-u2 disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar contraseña'}</button>
      </form>
    </main>
  )
}

function NoAccess({ email }: { email: string }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="font-display text-2xl font-bold">Sin permisos</h1>
        <p className="mt-2 text-muted">La cuenta <b>{email}</b> inició sesión, pero no tiene un rol administrativo activo. Pide a una persona con rol «owner» que te otorgue acceso.</p>
        <button onClick={() => void supabase().auth.signOut()} className="mt-4 rounded-lg bg-u px-4 py-2 font-bold text-white">Cerrar sesión</button>
      </div>
    </main>
  )
}

const NAV = [
  ['', 'Resumen'], ['respuestas', 'Respuestas'], ['noticias', 'Por noticia'], ['comportamiento', 'Comportamiento'],
  ['laboratorio', 'Laboratorio de análisis'], ['abiertas', 'Preguntas abiertas'], ['exportar', 'Exportar'],
  ['calidad', 'Calidad de datos'], ['metodologia', 'Metodología'], ['compartir', 'Compartir'],
] as const

function Shell({ profile, email }: { profile: AdminProfile; email: string }) {
  const ctx = useResearchDataState(profile)
  const [open, setOpen] = useState(false)
  const nav = profile.role === 'owner' ? [...NAV, ['administradores', 'Administradores'] as const] : NAV
  return (
    <DataContext.Provider value={ctx}>
      <header className="sticky top-0 z-20 border-b border-black/5 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
          <button className="rounded-md border border-soft px-2 py-1 lg:hidden" aria-expanded={open} aria-controls="admin-nav" onClick={() => setOpen(!open)}>Menú</button>
          <span className="font-display text-lg font-bold text-u">¿Lo reenviarías? <span className="font-body text-sm font-normal text-muted">· panel de investigación</span></span>
          <span className="ml-auto hidden text-sm text-muted sm:inline">{email} · {profile.role}</span>
          <button onClick={() => void supabase().auth.signOut()} className="rounded-md border border-soft px-3 py-1 text-sm hover:bg-lav">Salir</button>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-4">
        <nav id="admin-nav" aria-label="Secciones" className={`${open ? 'block' : 'hidden'} fixed inset-x-0 top-12 z-10 border-b bg-white p-3 lg:static lg:block lg:w-52 lg:shrink-0 lg:border-0 lg:bg-transparent lg:p-0`}>
          <ul className="space-y-0.5">
            {nav.map(([to, label]) => (
              <li key={to}>
                <NavLink end to={`/admin/${to}`} onClick={() => setOpen(false)} className={({ isActive }) => `block rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-u font-bold text-white' : 'text-ink hover:bg-lav'}`}>{label}</NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <main className="min-w-0 flex-1">
          <DataStatus />
          <FilterBar />
          <Routes>
            <Route index element={<Dashboard />} />
            <Route path="respuestas" element={<Explorer />} />
            <Route path="noticias" element={<Items />} />
            <Route path="comportamiento" element={<Behavior />} />
            <Route path="laboratorio" element={<Lab />} />
            <Route path="abiertas" element={<OpenResponses />} />
            <Route path="exportar" element={<Exports />} />
            <Route path="calidad" element={<Quality />} />
            <Route path="metodologia" element={<Methodology />} />
            <Route path="compartir" element={<Share />} />
            {profile.role === 'owner' && <Route path="administradores" element={<Admins />} />}
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </main>
      </div>
    </DataContext.Provider>
  )
}

function DataStatus() {
  const { data, loading, error, reload } = useData()
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-muted">
      {loading ? <span role="status">Cargando datos…</span> : error ? <span role="alert" className="text-red-700">{error}</span>
        : data && <span>{data.sessions.length.toLocaleString('es-CR')} sesiones y {data.decisions.length.toLocaleString('es-CR')} decisiones cargadas · {data.loadedAt.toLocaleTimeString('es-CR')}</span>}
      <button onClick={() => void reload()} disabled={loading} className="rounded-md border border-soft bg-white px-3 py-1 hover:bg-lav disabled:opacity-50">Actualizar</button>
    </div>
  )
}
