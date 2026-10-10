import { test, expect } from '@playwright/test'
import { decideCurrent, hasDb, sql, startAndAnswerOpinion } from './helpers'

test.describe('Aplicación pública', () => {
  test('sesión completa: opinión, 10 noticias (botones, gestos, teclado, lupa), pregunta final y guardado', async ({ page }, info) => {
    const sid = await startAndAnswerOpinion(page)
    expect(sid).toMatch(/^[0-9a-f-]{36}$/)

    // La carga útil del navegador no debe contener la clave de respuestas
    const payloadLeak = await page.evaluate(() => JSON.stringify(localStorage))
    expect(payloadLeak).not.toContain('is_real')

    const plan = ['real', 'falsa', 'swipe-right', 'swipe-left', 'key-right', 'key-left', 'real', 'falsa', 'real', 'falsa'] as const
    for (let i = 0; i < 10; i++) {
      if (i === 1) {
        await page.getByRole('button', { name: /Usar lupa/ }).click()
        await expect(page.getByText(/^🔍 /)).toBeVisible()
        await expect(page.getByLabel('Lupas disponibles: 1')).toBeVisible()
      }
      if (info.project.name === 'escritorio' || !plan[i].startsWith('swipe')) await decideCurrent(page, plan[i], i + 1)
      else await decideCurrent(page, plan[i], i + 1)
    }
    await expect(page.getByRole('heading', { name: 'Después de jugar…' })).toBeVisible()
    await page.getByRole('radio', { name: 'Sí, verificaría más' }).click()
    await page.getByRole('button', { name: 'Ver mi resultado' }).click()
    await expect(page.getByText('Tu respuesta anónima quedó guardada')).toBeVisible()

    const shownCorrect = Number((await page.locator('b', { hasText: /\/10$/ }).first().textContent())!.split('/')[0])
    const shownScore = Number(await page.locator('text=puntos').locator('..').locator('b').first().textContent())
    await page.screenshot({ path: `test-results/final-${info.project.name}.png`, fullPage: true })

    if (hasDb()) {
      const [s] = sql<{ status: string; n: number; correct: number; score: number; hints: number; post: string; pre: number }>(`
        select s.status, (select count(*) from game_decisions d where d.session_id = s.id)::int as n,
               g.correct_count as correct, g.score, g.hints_used as hints,
               (select option_value from survey_responses r join survey_questions q on q.id = r.question_id where r.session_id = s.id and q.question_key = 'post_cambio') as post,
               (select count(*) from survey_responses r where r.session_id = s.id and r.phase = 'pre')::int as pre
          from participant_sessions s join game_sessions_summary g on g.session_id = s.id where s.id = '${sid}'`)
      expect(s.status).toBe('completed')
      expect(s.n).toBe(10)
      expect(s.pre).toBe(4)
      expect(s.hints).toBe(1)
      expect(s.post).toBe('Sí, verificaría más')
      expect(s.correct).toBe(shownCorrect)
      expect(s.score).toBe(shownScore)
      // Cálculo independiente: aciertos = decisiones con choice igual a la clasificación correcta
      const [ind] = sql<{ c: number; p: number }>(`select count(*) filter (where d.choice = case when n.is_real then 'real' else 'falsa' end)::int as c, sum(d.points_awarded)::int as p from game_decisions d join news_items n on n.id = d.news_item_id where d.session_id = '${sid}'`)
      expect(ind.c).toBe(s.correct)
      expect(ind.p).toBe(s.score)
    }
  })

  test('respuesta abierta muy corta: dice por qué no se puede avanzar', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Acepto y quiero jugar' }).click()
    const toGame = page.getByRole('button', { name: 'Empezar el juego' })
    await expect(page.getByText('Te faltan 4 preguntas para continuar.')).toBeVisible()
    await page.getByRole('radio', { name: 'A veces' }).click()
    await page.getByRole('radio', { name: 'No estoy seguro/a' }).click()
    await page.getByRole('radio', { name: 'Todos por igual' }).click()
    await page.getByLabel(/noticia impactante/).fill('no')
    await expect(toGame).toBeDisabled()
    await expect(page.getByText('Te falta 1 pregunta para continuar.')).toBeVisible()
    await expect(page.getByText('Escribe al menos 3 caracteres.')).toHaveClass(/text-fake/)
    await page.getByLabel(/noticia impactante/).fill('no la comparto')
    await expect(toGame).toBeEnabled()
    await expect(page.getByText('Escribe al menos 3 caracteres.')).not.toHaveClass(/text-fake/)
  })

  test('recarga a mitad de partida: se reanuda en la misma noticia sin duplicar', async ({ page }) => {
    const sid = await startAndAnswerOpinion(page)
    await decideCurrent(page, 'real', 1)
    await decideCurrent(page, 'falsa', 2)
    await page.reload()
    await expect(page.getByText('Noticia 3 de 10')).toBeVisible()
    await decideCurrent(page, 'real', 3)
    if (hasDb()) {
      const [r] = sql<{ n: number; maxp: number }>(`select count(*)::int as n, max(position)::int as maxp from game_decisions where session_id = '${sid}'`)
      expect(r).toEqual({ n: 3, maxp: 3 })
    }
  })

  test('falla de red: reintenta automáticamente y no duplica la decisión', async ({ page }) => {
    const sid = await startAndAnswerOpinion(page)
    let failures = 0
    await page.route('**/rest/v1/rpc/submit_decision', async (route) => {
      if (failures < 2) { failures++; await route.abort('internetdisconnected'); return }
      await route.continue()
    })
    await page.getByRole('button', { name: /^Real/ }).click()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 20_000 })
    expect(failures).toBe(2)
    if (hasDb()) expect(sql(`select 1 from game_decisions where session_id = '${sid}'`)).toHaveLength(1)
  })

  test('doble clic y respuesta repetida no generan duplicados', async ({ page }) => {
    const sid = await startAndAnswerOpinion(page)
    const real = page.getByRole('button', { name: /^Real/ })
    await real.dblclick()
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByRole('dialog')).toBeVisible()
    if (hasDb()) expect(sql(`select 1 from game_decisions where session_id = '${sid}'`)).toHaveLength(1)
  })

  test('temporizador: sin respuesta en 20 s cuenta como tiempo agotado', async ({ page }) => {
    test.slow()
    const sid = await startAndAnswerOpinion(page)
    await expect(page.getByRole('heading', { name: '¡Se acabó el tiempo!' })).toBeVisible({ timeout: 25_000 })
    if (hasDb()) {
      const [d] = sql<{ timed_out: boolean; choice: string | null; points: number }>(`select timed_out, choice, points_awarded as points from game_decisions where session_id = '${sid}'`)
      expect(d).toEqual({ timed_out: true, choice: null, points: 0 })
    }
  })

  test('temporizador también corre con «reducir movimiento» (corrige el original)', async ({ browser }) => {
    test.slow()
    const ctx = await browser.newContext({ reducedMotion: 'reduce' })
    const page = await ctx.newPage()
    await startAndAnswerOpinion(page)
    await expect(page.getByRole('heading', { name: '¡Se acabó el tiempo!' })).toBeVisible({ timeout: 25_000 })
    await ctx.close()
  })

  test('texto con HTML se guarda como texto y no se ejecuta', async ({ page }) => {
    let alerted = false
    page.on('dialog', async (d) => { alerted = true; await d.dismiss() })
    await page.goto('/')
    await page.getByRole('button', { name: 'Acepto y quiero jugar' }).click()
    await page.getByLabel(/noticia impactante/).fill('<img src=x onerror=alert(1)> prueba')
    await page.getByRole('radio', { name: 'Siempre' }).click()
    await page.getByRole('radio', { name: 'No', exact: true }).click()
    await page.getByRole('radio', { name: 'Quien la crea' }).click()
    await page.getByRole('button', { name: 'Empezar el juego' }).click()
    await expect(page.getByText('Noticia 1 de 10')).toBeVisible()
    expect(alerted).toBe(false)
  })
})
