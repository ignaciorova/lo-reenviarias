import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'

// Dos interfaces independientes: el código del panel no se descarga en la app pública.
const GameApp = lazy(() => import('./game/GameApp'))
const AdminApp = lazy(() => import('./admin/AdminApp'))
const CodePage = lazy(() => import('./game/v4/CodePage'))

const Loading = () => <div className="grid min-h-dvh place-items-center bg-u3 text-white">Cargando…</div>

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/admin/*" element={<AdminApp />} />
          <Route path="/codigo" element={<CodePage />} />
          <Route path="*" element={<GameApp />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
)
