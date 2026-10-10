import { test, expect } from '@playwright/test'

// Sandbox 3.0.0 (solo en la rama claude/sandbox-noticias-ilustradas): no debe llamar a Supabase ni guardar nada.
test('sandbox de noticias ilustradas: ronda completa sin llamadas al servidor', async ({ page }) => {
  const external: string[] = []
  page.on('request', (r) => { if (/\/(rest|auth)\/v1\//.test(r.url()) || !r.url().startsWith(new URL(page.url() || 'http://x').origin)) external.push(r.url()) })
  await page.goto('/sandbox')
  external.length = 0
  await page.getByRole('button', { name: 'Jugar con imágenes' }).click()
  await expect(page.getByRole("img", { name: /bus blanco y verde/ })).toBeVisible()
  // Las 10 noticias alternan real y falsa
  for (let i = 0; i < 10; i++) {
    if (i === 2 || i === 7) await expect(page.locator('video').first()).toHaveJSProperty('muted', true)
    await page.getByRole('button', { name: i % 2 === 0 ? /Real/ : /Falsa/ }).click()
    if (i === 0) await expect(page.getByRole('heading', { name: '¡Bien! Era real' })).toBeVisible()
    await page.getByRole('button', { name: i < 9 ? 'Siguiente noticia' : 'Terminar' }).click()
  }
  await expect(page.getByText('Con imágenes: 10 de 10 correctas')).toBeVisible()
  await expect(page.getByRole('heading', { name: /No caíste/ })).toBeVisible()
  await page.getByRole('button', { name: 'Jugar sin imágenes (versión actual)' }).click()
  await expect(page.getByRole("img", { name: /bus blanco y verde/ })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: /pasaje de una ruta de bus/ })).toBeVisible()
  expect(external).toEqual([])
})

test('repaso final: muestra los trucos en los que cayó y dónde estaban', async ({ page }) => {
  await page.goto('/sandbox')
  await page.getByRole('button', { name: 'Jugar sin imágenes (versión actual)' }).click()
  // Responde todo al revés: cae en las 5 falsas y rechaza las 5 reales
  for (let i = 0; i < 10; i++) {
    await page.getByRole('button', { name: i % 2 === 0 ? /Falsa/ : /Real/ }).click()
    await page.getByRole('button', { name: i < 9 ? 'Siguiente noticia' : 'Terminar' }).click()
  }
  await expect(page.getByRole('heading', { name: 'Los trucos que te funcionaron' })).toBeVisible()
  await expect(page.getByText('La prisa')).toBeVisible()
  await expect(page.getByText('Te funcionó 3 veces')).toBeVisible()
  await page.getByText('La prisa').click()
  await expect(page.locator('details[open] mark').first()).toBeVisible()
  await expect(page.getByText('Cómo pillarlo en 10 segundos.').first()).toBeVisible()
})
