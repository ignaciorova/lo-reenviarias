import { test, expect } from '@playwright/test'
import { decideCurrent, hasDb, sql, sqlExec, startAndAnswerOpinion } from './helpers'

// La tabla solo aparece en versiones con "leaderboard": true. Aquí se activa en la versión local de prueba.
test.describe('Tabla de puntuación', () => {
  test.skip(!hasDb(), 'requiere base local')
  test.beforeAll(() => sqlExec(`update studies set config = config || '{"leaderboard": true}' where code = 'lo-reenviarias' and status = 'active'`))
  test.afterAll(() => sqlExec(`update studies set config = config - 'leaderboard' where code = 'lo-reenviarias' and status = 'active'`))

  test('al final, entrar es opcional y se publica solo el apodo', async ({ page }) => {
    const sid = await startAndAnswerOpinion(page)
    await expect(page.getByText('🏆 Ranking')).toHaveCount(0)
    for (let i = 1; i <= 10; i++) await decideCurrent(page, 'real', i)
    await page.getByRole('radio', { name: 'Sí, verificaría más' }).click()
    await page.getByRole('button', { name: 'Ver mi resultado' }).click()

    const board = page.getByRole('region', { name: '🏆 Ranking' })
    await expect(board).toBeVisible()
    await board.getByRole('button', { name: 'Entrar al ranking (opcional)' }).click()
    const alias = board.locator('p.font-display')
    const first = await alias.textContent()
    for (let i = 0; i < 5 && (await alias.textContent()) === first; i++) await board.getByRole('button', { name: '🎲 Otro' }).click()
    const chosen = (await alias.textContent())!
    expect(chosen).toMatch(/^\S+ \S+ \d{2} \S+$/)
    await board.getByRole('button', { name: 'Publicar' }).click()
    await expect(board.getByRole('status')).toContainText(`¡Listo, ${chosen}!`)
    await expect(board.getByRole('listitem').filter({ hasText: chosen })).toBeVisible()
    await expect(board.getByRole('button', { name: 'Entrar al ranking (opcional)' })).toHaveCount(0)

    const [g] = sql<{ score: number; joined: boolean }>(`select g.score, s.leaderboard_joined as joined from game_sessions_summary g join participant_sessions s on s.id = g.session_id where s.id = '${sid}'`)
    expect(g.joined).toBe(true)
    expect(sql(`select score from leaderboard_entries where alias = '${chosen}'`)).toEqual([{ score: g.score }])

    // Al recargar sigue la tabla, pero ya no se puede volver a entrar
    await page.reload()
    await expect(board.getByRole('listitem').filter({ hasText: chosen })).toBeVisible()
    await expect(board.getByRole('button', { name: 'Entrar al ranking (opcional)' })).toHaveCount(0)
  })
})
