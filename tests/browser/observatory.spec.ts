import { expect, test } from '@playwright/test'

const introSessionKey = 'komari-observatory:intro:1.4.2-fix1'

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => {
    sessionStorage.setItem(key, 'seen')
  }, introSessionKey)
})

test('renders the Komari 1.4.2 fixture without viewport overflow', async ({ page }, testInfo) => {
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))

  await page.goto('/')
  await expect(page.getByText('Tokyo Fixture', { exact: true })).toBeVisible()
  await expect(page.getByText('Frankfurt Fixture', { exact: true })).toBeVisible()

  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1)
  expect(pageErrors).toEqual([])

  const cards = page.locator('.node-card')
  const liveBadges = cards.locator('.lnl-node-live-state')
  await expect(liveBadges.first()).toHaveText(/在线 \d+天/)
  const badgeWidths = await liveBadges.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().width))
  expect(Math.max(...badgeWidths) - Math.min(...badgeWidths)).toBeLessThanOrEqual(0.5)

  const lifecycleItems = cards.first().locator('.lnl-node-lifecycle-item')
  await expect(lifecycleItems).toHaveCount(3)
  const lifecycleGeometry = await lifecycleItems.evaluateAll(elements => elements.map((element) => {
    const htmlElement = element as HTMLElement
    return {
      width: htmlElement.getBoundingClientRect().width,
      contained: htmlElement.scrollWidth <= htmlElement.clientWidth + 1,
    }
  }))
  expect(lifecycleGeometry.every(item => item.contained)).toBe(true)
  expect(Math.max(...lifecycleGeometry.map(item => item.width)) - Math.min(...lifecycleGeometry.map(item => item.width))).toBeLessThanOrEqual(1)

  if (testInfo.project.name === 'chromium-desktop') {
    const viewportMatrix = [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 820, height: 768 },
      { width: 844, height: 390 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
    ]

    for (const viewport of viewportMatrix) {
      await page.setViewportSize(viewport)
      await page.reload()
      await expect(page.getByText('Tokyo Fixture', { exact: true })).toBeVisible()
      const widths = await page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }))
      expect(widths.scroll, `${viewport.width}x${viewport.height} overflow`).toBeLessThanOrEqual(widths.client + 1)
    }
  }
})

test('does not flash false empty node cards while initial nodes are loading', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'One deterministic engine covers the delayed loading contract.')
  await page.route('**/api/rpc2', async (route) => {
    let method = ''
    try {
      method = String(route.request().postDataJSON()?.method ?? '')
    }
    catch {
    }
    if (method === 'common:getNodes')
      await new Promise(resolve => setTimeout(resolve, 520))
    await route.continue()
  })

  await page.goto('/')
  await expect(page.locator('.lnl-node-skeleton-card')).toHaveCount(0)
  await expect(page.locator('.lnl-node-loading-indicator')).toBeVisible()
  await expect(page.getByText('Tokyo Fixture', { exact: true })).toBeVisible()
  await expect(page.locator('.lnl-node-loading-indicator')).toHaveCount(0)
})

test('supports keyboard search, FLIP reordering, and Ping details', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Tokyo Fixture', { exact: true })).toBeVisible()

  const searchToggle = page.locator('button[aria-controls="node-search"]')
  await searchToggle.focus()
  await expect(searchToggle).toBeFocused()
  await searchToggle.press('Enter')

  const searchInput = page.locator('#node-search')
  const tokyoCardTitle = page.locator('.lnl-node-title', { hasText: 'Tokyo Fixture' })
  await expect(searchInput).toBeFocused()
  await searchInput.fill('Frankfurt')
  await expect(page.getByText('Frankfurt Fixture', { exact: true })).toBeVisible()
  await expect(tokyoCardTitle).toBeHidden()

  await searchInput.press('Escape')
  await expect(searchToggle).toBeFocused()
  await expect(tokyoCardTitle).toBeVisible()
  await expect(page.locator('.node-card-switch-move')).toHaveCount(0)

  await page.locator('[data-node-ping-panel="latency"]').first().click()
  await expect(page.locator('.lnl-ping-dialog')).toBeVisible()
  await expect(page.getByText('Tokyo route probe', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.lnl-ping-dialog')).toBeHidden()
})

test('settles an active theme transition when reduced motion changes at runtime', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('appearance', 'light')
    localStorage.setItem('leonetlab:appearance:user-override', '1')
  })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  await expect(page.getByText('Tokyo Fixture', { exact: true })).toBeVisible()

  await page.locator('[data-action="toggleTheme"]').click()
  await expect.poll(() => page.locator('html').evaluate(element => element.classList.contains('lnl-theme-transitioning'))).toBe(true)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(() => page.locator('html').evaluate(element => element.classList.contains('lnl-theme-transitioning'))).toBe(false)
  await expect(page.locator('.lnl-theme-wipe')).toHaveCount(0)
})

test('keeps touch controls and node cards inside compact viewports', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Compact touch geometry is covered by mobile and tablet projects.')
  await page.goto('/')
  await expect(page.getByText('Tokyo Fixture', { exact: true })).toBeVisible()

  const searchToggle = page.locator('button[aria-controls="node-search"]')
  await searchToggle.scrollIntoViewIfNeeded()
  const controls = await searchToggle.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }
  })
  expect(controls.left).toBeGreaterThanOrEqual(0)
  expect(controls.right).toBeLessThanOrEqual(controls.viewportWidth)
  expect(controls.top).toBeGreaterThanOrEqual(0)
  expect(controls.bottom).toBeLessThanOrEqual(controls.viewportHeight)

  await page.locator('[data-node-ping-panel="latency"]').first().click()
  await expect(page.locator('.lnl-ping-dialog')).toBeVisible()
})
