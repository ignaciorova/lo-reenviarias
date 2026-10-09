import { readFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { hasDb, sql, sqlExec } from './helpers'

// Tokens firmados para el entorno LOCAL (scripts/local-jwt.mjs). En producción se usa el inicio de sesión real.
const tok = (name: string) => (process.env.E2E_TOKEN_DIR ? readFileSync(`${process.env.E2E_TOKEN_DIR}/${name}.jwt`, 'utf8').trim() : '')
async function loginAs(page: Page, token: string, id: string, email: string) {
  await page.goto('/admin')
  await page.evaluate(([t, i, e]) => {
    const exp = Math.floor(Date.now() / 1000) + 3600
    localStorage.setItem('lr-admin-auth', JSON.stringify({ access_token: t, refresh_token: 'local', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: { id: i, email: e, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } }))
  }, [token, id, email])
  await page.reload()
}

async function go(page: Page, name: string) {
  await page.getByRole('button', { name: 'Salir' }).waitFor()
  const menu = page.getByRole('button', { name: 'Menú' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('link', { name, exact: true }).click()
}

test.describe('Panel de investigación', () => {
  test.skip(!process.env.E2E_TOKEN_DIR, 'requiere tokens locales')

  test('sin sesión muestra el inicio de sesión y no carga datos', async ({ page }) => {
    const rpcCalls: string[] = []
    page.on('request', (r) => { if (r.url().includes('/rest/v1/v_')) rpcCalls.push(r.url()) })
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: 'Panel de investigación' })).toBeVisible()
    await expect(page.getByLabel('Contraseña')).toBeVisible()
    expect(rpcCalls).toHaveLength(0)
  })

  test('cuenta autenticada sin rol: «Sin permisos» y la API no devuelve filas', async ({ page, request }) => {
    await loginAs(page, tok('nobody'), '00000000-0000-4000-8000-0000000000bb', 'nobody-e2e@test.local')
    await expect(page.getByRole('heading', { name: 'Sin permisos' })).toBeVisible()
    const r = await request.get('/rest/v1/v_sessions?select=session_id', { headers: { apikey: tok('anon'), Authorization: `Bearer ${tok('nobody')}` } })
    expect(await r.json()).toEqual([])
    const anon = await request.get('/rest/v1/v_sessions?select=session_id', { headers: { apikey: tok('anon'), Authorization: `Bearer ${tok('anon')}` } })
    expect(anon.status()).toBe(401)
  })

  test('owner: las métricas del panel coinciden con SQL independiente', async ({ page }) => {
    await loginAs(page, tok('owner'), '00000000-0000-4000-8000-0000000000aa', 'owner-e2e@test.local')
    await expect(page.getByRole('heading', { name: 'Resumen ejecutivo' })).toBeVisible()
    await expect(page.getByText(/sesiones y .* decisiones cargadas/)).toBeVisible()
    const kpi = async (label: string) => (await page.getByText(label, { exact: true }).locator('xpath=..').locator('div.font-display').textContent())!.trim()

    if (hasDb()) {
      const [q] = sql<{ started: number; completed: number; valid: number; mean: string; acc: string; fake: string; real: string; loaded: number }>(`
        with s as (select * from participant_sessions where not is_test),
             v as (select s.* from s join game_sessions_summary g on g.session_id = s.id
                    where s.status = 'completed' and s.exclusion_reason is null
                      and g.decisions_count = coalesce(nullif(cardinality(s.presentation_order),0),10)),
             d as (select d.* from game_decisions d join v on v.id = d.session_id)
        select (select count(*) from s)::int as started,
               (select count(*) from s where status = 'completed')::int as completed,
               (select count(*) from v)::int as valid,
               to_char((select avg(g.correct_count) from game_sessions_summary g join v on v.id = g.session_id), 'FM990.0') as mean,
               to_char(100.0 * (select count(*) filter (where is_correct) from d) / nullif((select count(*) from d),0), 'FM990.0') as acc,
               to_char(100.0 * (select count(*) filter (where choice = 'real') from d where correct_classification = 'falsa') / nullif((select count(*) from d where correct_classification = 'falsa'),0), 'FM990.0') as fake,
               to_char(100.0 * (select count(*) filter (where choice = 'falsa') from d where correct_classification = 'real') / nullif((select count(*) from d where correct_classification = 'real'),0), 'FM990.0') as real,
               (select count(*) from participant_sessions)::int as loaded`)
      expect(await kpi('Sesiones iniciadas')).toBe(q.started.toLocaleString('es-CR'))
      expect(await kpi('Completadas')).toBe(q.completed.toLocaleString('es-CR'))
      expect(await kpi('Sesiones válidas')).toBe(q.valid.toLocaleString('es-CR'))
      expect(await kpi('Aciertos promedio')).toBe(q.mean.replace('.', ','))
      expect(await kpi('Clasificación correcta')).toBe(`${q.acc.replace('.', ',')}%`)
      expect(await kpi('Aceptación de falsas')).toBe(`${q.fake.replace('.', ',')}%`)
      expect(await kpi('Rechazo de verdaderas')).toBe(`${q.real.replace('.', ',')}%`)
      await expect(page.getByText(`${q.loaded.toLocaleString('es-CR')} sesiones y`)).toBeVisible()
    }
    await page.screenshot({ path: `test-results/admin-resumen-${test.info().project.name}.png`, fullPage: true })
  })

  test('owner: una sesión recién jugada aparece en el panel', async ({ page, browser }) => {
    const before = hasDb() ? sql<{ n: number }>(`select count(*)::int as n from participant_sessions where status = 'completed' and not is_test`)[0].n : 0
    const ctx = await browser.newContext()
    const g = await ctx.newPage()
    await g.goto('/')
    await g.getByRole('button', { name: 'Acepto y quiero jugar' }).click()
    await g.getByLabel(/noticia impactante/).fill('Sesión E2E para el panel')
    await g.getByRole('radio', { name: 'Casi nunca' }).click()
    await g.getByRole('radio', { name: 'Sí', exact: true }).click()
    await g.getByRole('radio', { name: 'La red social' }).click()
    await g.getByRole('button', { name: 'Empezar el juego' }).click()
    for (let i = 1; i <= 10; i++) {
      await expect(g.getByText(`Noticia ${i} de 10`)).toBeVisible()
      await g.getByRole('button', { name: /^Real/ }).click()
      await g.getByRole('dialog').getByRole('button', { name: i < 10 ? 'Siguiente noticia' : 'Terminar' }).click()
    }
    await g.getByRole('radio', { name: 'Tal vez' }).click()
    await g.getByRole('button', { name: 'Ver mi resultado' }).click()
    await expect(g.getByText('Tu respuesta anónima quedó guardada')).toBeVisible()
    await ctx.close()

    await loginAs(page, tok('owner'), '00000000-0000-4000-8000-0000000000aa', 'owner-e2e@test.local')
    await go(page, 'Respuestas')
    await page.getByLabel('Buscar').fill('Sesión E2E para el panel')
    await expect(page.getByText('Sesión E2E para el panel').first()).toBeVisible()
    if (hasDb()) {
      await go(page, 'Resumen')
      const kpiText = await page.getByText('Completadas', { exact: true }).locator('xpath=..').locator('div.font-display').textContent()
      expect(Number(kpiText!.replace(/\D/g, ''))).toBe(before + 1)
    }
  })

  test('owner: filtros, laboratorio y exportaciones', async ({ page }) => {
    await loginAs(page, tok('owner'), '00000000-0000-4000-8000-0000000000aa', 'owner-e2e@test.local')
    await expect(page.getByText(/decisiones cargadas/)).toBeVisible()
    await page.getByText('Filtros', { exact: true }).click()
    await page.getByRole('button', { name: '2.0.0', exact: true }).click()
    const total = hasDb() ? sql<{ n: number }>(`select count(*)::int as n from participant_sessions where not is_test and instrument_version = '2.0.0'`)[0].n : null
    await go(page, 'Respuestas')
    if (total !== null) await expect(page.getByRole('heading', { name: `${total.toLocaleString('es-CR')} sesiones` })).toBeVisible()

    await go(page, 'Laboratorio de análisis')
    await expect(page.getByText(/sesiones válidas · excluidas/)).toBeVisible()
    await expect(page.getByText('Método:').first()).toBeVisible()

    await go(page, 'Exportar')
    const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Dataset por decisión' }).click()])
    const csvText = readFileSync((await csv.path())!, 'utf8')
    expect(csvText.charCodeAt(0)).toBe(0xfeff)
    const lines = csvText.trim().split('\r\n')
    if (hasDb()) {
      const [n] = sql<{ n: number }>(`select count(*)::int as n from game_decisions d join participant_sessions s on s.id = d.session_id where not s.is_test and s.instrument_version = '2.0.0'`)
      expect(lines.length - 1).toBe(n.n)
    }
    const [x] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Excel/ }).click()])
    const buf = readFileSync((await x.path())!)
    expect(buf.subarray(0, 2).toString()).toBe('PK')
    if (hasDb()) expect(sql(`select 1 from audit_events where action = 'export'`).length).toBeGreaterThanOrEqual(2)
  })

  test('owner: enlace y código QR para compartir', async ({ page, baseURL }) => {
    await loginAs(page, tok('owner'), '00000000-0000-4000-8000-0000000000aa', 'owner-e2e@test.local')
    await go(page, 'Compartir')
    await expect(page.getByText(new URL('/', baseURL!).href, { exact: true })).toBeVisible()
    await expect(page.getByRole('img', { name: /Código QR que abre/ })).toBeVisible()
    const [png] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar PNG' }).click()])
    expect(readFileSync((await png.path())!).subarray(1, 4).toString()).toBe('PNG')
  })

  test('owner: depuración de sesiones de prueba con confirmación y auditoría', async ({ page }) => {
    test.skip(!hasDb(), 'requiere base local')
    sqlExec(`insert into participant_sessions (id, study_id, instrument_version, is_test, started_at)
         select gen_random_uuid(), id, '2.0.0', true, now() - interval '3 days' from studies where version = '2.0.0'`)
    const before = sql<{ n: number }>(`select count(*)::int as n from participant_sessions where is_test and started_at < now() - interval '1 day'`)[0].n
    expect(before).toBeGreaterThan(0)
    await loginAs(page, tok('owner'), '00000000-0000-4000-8000-0000000000aa', 'owner-e2e@test.local')
    await go(page, 'Calidad de datos')
    page.once('dialog', (d) => void d.accept())
    await page.getByRole('button', { name: /Eliminar sesiones de prueba/ }).click()
    await expect(page.getByText(`${before} sesiones eliminadas.`)).toBeVisible()
    expect(sql<{ n: number }>(`select count(*)::int as n from participant_sessions where is_test and started_at < now() - interval '1 day'`)[0].n).toBe(0)
    expect(sql(`select 1 from audit_events where action = 'purge_sessions'`).length).toBeGreaterThanOrEqual(1)
  })
})

test('enlace de recuperación: pide la contraseña nueva y la guarda', async ({ page }) => {
  const user = { id: '00000000-0000-4000-8000-0000000000cc', email: 'recupera-e2e@test.local', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }
  let saved: unknown = null
  await page.route('**/auth/v1/user', async (route) => {
    if (route.request().method() === 'PUT') saved = route.request().postDataJSON()
    await route.fulfill({ json: user })
  })
  await page.route('**/rest/v1/rpc/my_admin_profile', (route) => route.fulfill({ json: null }))
  const exp = Math.floor(Date.now() / 1000) + 3600
  await page.goto(`/admin#access_token=recovery-e2e&refresh_token=r&expires_in=3600&expires_at=${exp}&token_type=bearer&type=recovery`)
  await expect(page.getByRole('heading', { name: 'Nueva contraseña' })).toBeVisible()
  await page.getByLabel('Contraseña nueva').fill('corta')
  await page.getByLabel('Repítela').fill('corta')
  await page.getByRole('button', { name: 'Guardar contraseña' }).click()
  await expect(page.getByRole('alert')).toContainText('al menos 12')
  await page.getByLabel('Contraseña nueva').fill('una-contraseña-larga')
  await page.getByLabel('Repítela').fill('una-contraseña-larga')
  await page.getByRole('button', { name: 'Guardar contraseña' }).click()
  await expect(page.getByRole('heading', { name: 'Sin permisos' })).toBeVisible()
  expect(saved).toMatchObject({ password: 'una-contraseña-larga' })
  expect(page.url()).not.toContain('access_token')
})
