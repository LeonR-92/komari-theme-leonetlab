import { expect, test } from '@playwright/test'

const introSessionKey = 'komari-observatory:intro:1.4.3'

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => {
    sessionStorage.setItem(key, 'seen')
  }, introSessionKey)
})

test('recovers once when the desktop entry asset is replaced by stale HTML', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'One deterministic desktop engine covers pre-mount recovery.')
  let entryRequests = 0

  await page.route('**/assets/index-*.js', async (route) => {
    if (route.request().resourceType() !== 'script') {
      await route.continue()
      return
    }
    entryRequests += 1
    if (entryRequests === 1) {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><title>stale theme response</title>',
      })
      return
    }
    await route.continue()
  })

  await page.goto('/')
  await expect(page.getByText('Tokyo Fixture', { exact: true })).toBeVisible({ timeout: 15_000 })
  expect(entryRequests).toBeGreaterThanOrEqual(2)
  await expect(page.locator('#lnl-boot-fallback')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => ({
    attempt: sessionStorage.getItem('komari-observatory:boot-recovery'),
    recoveryQuery: new URL(location.href).searchParams.has('__komari_boot_recovery'),
  }))).toEqual({ attempt: null, recoveryQuery: false })
})

test('renders the Komari 1.4.3 fixture without viewport overflow', async ({ page }, testInfo) => {
  const pageErrors: string[] = []
  const iconifyRequests: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('request', (request) => {
    if (request.url().includes('api.iconify.design'))
      iconifyRequests.push(request.url())
  })

  await page.goto('/')
  await expect(page.getByText('Tokyo Fixture', { exact: true })).toBeVisible()
  await expect(page.getByText('Frankfurt Fixture', { exact: true })).toBeVisible()

  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1)
  expect(pageErrors).toEqual([])
  expect(iconifyRequests).toEqual([])

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

test('loads capability-gated GPU telemetry only after the tab is opened', async ({ page }) => {
  const metricCalls: Array<Record<string, unknown>> = []
  page.on('request', (request) => {
    if (!request.url().endsWith('/api/rpc2') || request.method() !== 'POST')
      return
    try {
      const body = request.postDataJSON() as { method?: string, params?: Record<string, unknown> }
      if (body.method?.startsWith('public:'))
        metricCalls.push({ method: body.method, ...body.params })
    }
    catch {
    }
  })

  await page.goto('/instance/fixture-node-a')
  await expect(page.getByText('资源与系统记录')).toBeVisible()
  const gpuTab = page.getByRole('tab', { name: 'GPU', exact: true })
  await gpuTab.scrollIntoViewIfNeeded()
  await expect(gpuTab).toBeVisible()
  expect(metricCalls.some(call => call.method === 'public:listMetricDefinitions')).toBe(true)
  expect(metricCalls.some(call => Array.isArray(call.metric_keys) && call.metric_keys.includes('gpu.device.usage'))).toBe(false)

  await gpuTab.click()
  await expect.poll(() => metricCalls.some(call => Array.isArray(call.metric_keys) && call.metric_keys.includes('gpu.device.usage'))).toBe(true)
  await expect(page.locator('canvas').last()).toBeVisible()
})

test('honors backend-managed telemetry switches and lazily loads Komari 1.4.3 GPU metrics', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'One deterministic engine covers managed telemetry selection.')
  const metricCalls: string[][] = []
  await page.route('**/api/public', async (route) => {
    const response = await route.fetch()
    const payload = await response.json() as { data?: { theme_settings?: Record<string, unknown> } }
    const settings = payload.data?.theme_settings
    if (settings) {
      settings.extendedTelemetryConnectionsEnabled = false
      settings.extendedTelemetryProcessEnabled = true
      settings.extendedTelemetryGpuUsageEnabled = false
      settings.extendedTelemetryGpuMemoryEnabled = true
      settings.extendedTelemetryGpuTemperatureEnabled = false
    }
    await route.fulfill({ response, json: payload })
  })
  page.on('request', (request) => {
    if (!request.url().endsWith('/api/rpc2') || request.method() !== 'POST')
      return
    const body = request.postDataJSON() as { method?: string, params?: { metric_keys?: string[] } }
    if (body.method === 'public:queryMetrics' && Array.isArray(body.params?.metric_keys))
      metricCalls.push(body.params.metric_keys)
  })

  await page.goto('/instance/fixture-node-a')
  const workspace = page.locator('[data-extended-telemetry]')
  await expect(workspace.getByRole('tab', { name: '连接', exact: true })).toHaveCount(0)
  await expect(workspace.getByRole('tab', { name: '进程', exact: true })).toBeVisible()
  await expect(workspace.getByRole('tab', { name: 'GPU', exact: true })).toHaveCount(0)
  await expect(workspace.getByRole('tab', { name: '温度', exact: true })).toHaveCount(0)
  const memoryTab = workspace.getByRole('tab', { name: '显存', exact: true })
  await memoryTab.click()
  await expect.poll(() => metricCalls.some(keys => keys.includes('gpu.memory.used') && keys.includes('gpu.memory.total'))).toBe(true)
  await expect(workspace.locator('canvas')).toBeVisible()
})

test('isolates GPU failures from connection and process telemetry', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'One deterministic engine covers optional telemetry error isolation.')
  let gpuAttempts = 0
  await page.route('**/api/rpc2', async (route) => {
    const body = route.request().postDataJSON() as { id?: number, method?: string, params?: { metric_keys?: string[] } }
    if (body.method !== 'public:queryMetrics' || !body.params?.metric_keys?.includes('gpu.device.usage')) {
      await route.continue()
      return
    }
    gpuAttempts += 1
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: body.id,
        error: gpuAttempts === 1
          ? { code: -32000, message: 'Fixture GPU query failed' }
          : { code: -32603, message: 'Internal error: metric store not initialized' },
      }),
    })
  })

  await page.goto('/instance/fixture-node-a')
  const workspace = page.locator('[data-extended-telemetry]')
  const gpuTab = workspace.getByRole('tab', { name: 'GPU', exact: true })
  await gpuTab.click()
  await expect(workspace.getByText('该指标暂时无法加载，请稍后重试')).toBeVisible()

  await workspace.getByRole('tab', { name: '连接', exact: true }).click()
  await expect(workspace.getByText('该指标暂时无法加载，请稍后重试')).toHaveCount(0)
  await expect(workspace.locator('canvas')).toBeVisible()
  await workspace.getByRole('tab', { name: '进程', exact: true }).click()
  await expect(workspace.locator('canvas')).toBeVisible()

  await gpuTab.click()
  await expect.poll(() => gpuAttempts).toBe(2)
  await expect(workspace.getByText('该项历史采集未启用或暂无数据')).toBeVisible()
})

test('discards stale GPU responses and treats empty series as unavailable data', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'One deterministic engine covers optional telemetry request races.')
  let gpuAttempts = 0
  await page.route('**/api/rpc2', async (route) => {
    const body = route.request().postDataJSON() as { id?: number, method?: string, params?: { metric_keys?: string[] } }
    if (body.method !== 'public:queryMetrics' || !body.params?.metric_keys?.includes('gpu.device.usage')) {
      await route.continue()
      return
    }
    gpuAttempts += 1
    if (gpuAttempts === 1)
      await new Promise(resolve => setTimeout(resolve, 450))
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: body.id,
        result: {
          start: '2026-08-13T00:00:00Z',
          end: '2026-08-13T00:01:00Z',
          count: gpuAttempts === 1 ? 1 : 0,
          series: gpuAttempts === 1
            ? [{ metric_key: 'gpu.device.usage', entity_id: 'fixture-node-a', count: 1, points: [{ time: '2026-08-13T00:00:00Z', value: 42 }] }]
            : [],
        },
      }),
    })
  })

  await page.goto('/instance/fixture-node-a')
  const workspace = page.locator('[data-extended-telemetry]')
  const gpuTab = workspace.getByRole('tab', { name: 'GPU', exact: true })
  await gpuTab.click()
  await expect.poll(() => gpuAttempts).toBe(1)
  await workspace.getByRole('tab', { name: '连接', exact: true }).click()
  await expect(workspace.locator('canvas')).toBeVisible()
  await page.waitForTimeout(500)
  await expect(workspace.locator('canvas')).toBeVisible()

  await page.getByRole('tab', { name: '4 小时', exact: true }).click()
  await gpuTab.click()
  await expect.poll(() => gpuAttempts).toBe(2)
  await expect(workspace.getByText('该项历史采集未启用或暂无数据')).toBeVisible()
})

test.describe('Chromium PWA cache', () => {
  test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || isMobile, 'One desktop service-worker engine covers the deterministic cache contract.')

  test('pre-caches every installed PWA icon without caching API data', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
      await new Promise(resolve => setTimeout(resolve, 500))
    })

    const cacheAudit = await page.evaluate(async () => {
      const manifest = await fetch('/manifest.webmanifest').then(response => response.json()) as { icons: Array<{ src: string }> }
      const cached = await Promise.all(manifest.icons.map(async icon => Boolean(await caches.match(icon.src))))
      const keys = await caches.keys()
      const requests = (await Promise.all(keys.map(async key => (await caches.open(key)).keys()))).flat()
      return {
        cached,
        cachedPaths: requests.map(request => new URL(request.url).pathname),
      }
    })

    expect(cacheAudit.cached.every(Boolean)).toBe(true)
    expect(cacheAudit.cachedPaths.some(path => path.startsWith('/api/') || path === '/api/rpc2')).toBe(false)
  })
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

test('settles an active theme transition when reduced motion changes at runtime', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('chromium-'), 'Runtime reduced-motion media changes are deterministic in Chromium projects.')
  await page.addInitScript(() => {
    localStorage.setItem('appearance', 'light')
    localStorage.setItem('leonetlab:appearance:user-override', '1')
  })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  await expect(page.getByText('Tokyo Fixture', { exact: true })).toBeVisible()

  const themeToggle = page.locator('[data-action="toggleTheme"]')
  await themeToggle.click()
  await page.waitForTimeout(120)
  if (!await page.locator('html').evaluate(element => element.classList.contains('lnl-theme-transitioning')))
    await themeToggle.click()
  await expect.poll(() => page.locator('html').evaluate(element => element.classList.contains('lnl-theme-transitioning'))).toBe(true)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(() => page.locator('html').evaluate(element => element.classList.contains('lnl-theme-transitioning'))).toBe(false)
  await expect(page.locator('.lnl-theme-wipe')).toHaveCount(0)
})

test('reveals the new theme snapshot from the toggle button without rebuilding the page', async ({ page }, testInfo) => {
  test.skip(!['chromium-desktop', 'chromium-mobile'].includes(testInfo.project.name), 'Chromium desktop and mobile cover View Transition timing.')
  await page.addInitScript(() => {
    localStorage.setItem('appearance', 'light')
    localStorage.setItem('leonetlab:appearance:user-override', '1')
  })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  await expect(page.getByText('Tokyo Fixture', { exact: true })).toBeVisible()

  const result = await page.locator('[data-action="toggleTheme"]').evaluate(async (button) => {
    const root = document.documentElement
    const rect = button.getBoundingClientRect()
    const expectedX = rect.left + rect.width / 2
    const expectedY = rect.top + rect.height / 2
    const expectedRadius = Math.hypot(
      Math.max(expectedX, innerWidth - expectedX),
      Math.max(expectedY, innerHeight - expectedY),
    )
    const canvas = document.querySelector('canvas')
    const scrollXBefore = scrollX
    const scrollYBefore = scrollY
    let starts = 0
    let ends = 0
    const endPromise = new Promise<void>((resolve) => {
      window.addEventListener('leonetlab:theme-transition-start', () => starts += 1)
      window.addEventListener('leonetlab:theme-transition-end', () => {
        ends += 1
        resolve()
      }, { once: true })
    })
    const startedAt = performance.now()
    ;(button as HTMLButtonElement).click()
    let revealAnimation: Animation | undefined
    const animationDeadline = performance.now() + 400
    while (!revealAnimation && performance.now() < animationDeadline) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      revealAnimation = document.getAnimations().find((animation) => {
        const effect = animation.effect as KeyframeEffect & { pseudoElement?: string } | null
        return effect?.pseudoElement === '::view-transition-new(root)'
          || (animation as CSSAnimation).animationName === 'lnl-theme-reveal'
      })
    }
    const revealEffect = revealAnimation?.effect as KeyframeEffect | null
    const timing = revealEffect?.getTiming()
    const revealKeyframes = revealEffect?.getKeyframes()
    const originX = Number.parseFloat(root.style.getPropertyValue('--theme-x'))
    const originY = Number.parseFloat(root.style.getPropertyValue('--theme-y'))
    const radius = Number.parseFloat(root.style.getPropertyValue('--theme-radius'))
    await Promise.race([endPromise, new Promise<void>(resolve => setTimeout(resolve, 1500))])
    return {
      supported: typeof (document as Document & { startViewTransition?: unknown }).startViewTransition === 'function',
      duration: Number(timing?.duration ?? 0),
      easing: revealKeyframes?.[0]?.easing ?? '',
      elapsed: performance.now() - startedAt,
      x: originX,
      y: originY,
      radius,
      expectedX,
      expectedY,
      expectedRadius,
      starts,
      ends,
      dark: root.classList.contains('dark'),
      colorScheme: root.style.colorScheme,
      themeColor: document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content,
      fallbackMounted: Boolean(document.querySelector('.lnl-theme-wipe')),
      canvasSame: canvas === document.querySelector('canvas'),
      scrollUnchanged: scrollX === scrollXBefore && scrollY === scrollYBefore,
      finished: !root.classList.contains('lnl-theme-transitioning'),
    }
  })

  expect(result.supported).toBe(true)
  expect(result.duration).toBe(680)
  expect(result.easing.replaceAll(' ', '')).toBe('cubic-bezier(0.22,1,0.36,1)')
  expect(Math.abs(result.x - result.expectedX)).toBeLessThanOrEqual(1)
  expect(Math.abs(result.y - result.expectedY)).toBeLessThanOrEqual(1)
  expect(result.radius).toBeGreaterThanOrEqual(result.expectedRadius)
  expect(result.starts).toBe(1)
  expect(result.ends).toBe(1)
  expect(result.dark).toBe(true)
  expect(result.colorScheme).toBe('dark')
  expect(result.themeColor).toBe('#04100d')
  expect(result.fallbackMounted).toBe(false)
  expect(result.canvasSame).toBe(true)
  expect(result.scrollUnchanged).toBe(true)
  expect(result.finished).toBe(true)

  const button = page.locator('[data-action="toggleTheme"]')
  await button.click()
  if (await page.locator('html').evaluate(root => root.classList.contains('dark')))
    await button.click()
  await expect.poll(() => page.locator('html').evaluate(root => root.classList.contains('dark'))).toBe(false)
  await expect.poll(() => page.locator('html').evaluate(root => root.classList.contains('lnl-theme-transitioning'))).toBe(false)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('appearance'))).toBe('light')
})

test('uses the lightweight circular fallback when View Transitions are unavailable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'One deterministic engine covers the legacy fallback.')
  await page.addInitScript(() => {
    localStorage.setItem('appearance', 'light')
    localStorage.setItem('leonetlab:appearance:user-override', '1')
    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: undefined })
  })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  await expect(page.getByText('Tokyo Fixture', { exact: true })).toBeVisible()

  const button = page.locator('[data-action="toggleTheme"]')
  const rect = await button.boundingBox()
  await button.click()
  const wipe = page.locator('.lnl-theme-wipe.is-revealing')
  await expect(wipe).toBeVisible()
  const fallback = await wipe.evaluate((element) => {
    const root = document.documentElement
    const timing = element.getAnimations()[0]?.effect?.getTiming()
    return {
      duration: Number(timing?.duration ?? 0),
      x: Number.parseFloat(root.style.getPropertyValue('--theme-x')),
      y: Number.parseFloat(root.style.getPropertyValue('--theme-y')),
    }
  })
  expect(fallback.duration).toBe(680)
  expect(Math.abs(fallback.x - ((rect?.x ?? 0) + (rect?.width ?? 0) / 2))).toBeLessThanOrEqual(1)
  expect(Math.abs(fallback.y - ((rect?.y ?? 0) + (rect?.height ?? 0) / 2))).toBeLessThanOrEqual(1)
  await expect.poll(() => page.locator('html').evaluate(root => root.classList.contains('dark'))).toBe(true)
  await expect(page.locator('.lnl-theme-wipe')).toHaveCount(0)
  await expect.poll(() => page.locator('html').evaluate(root => root.classList.contains('lnl-theme-transitioning'))).toBe(false)
})

test('keeps only the final request during rapid theme toggles', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'One deterministic engine covers queued transitions.')
  await page.addInitScript(() => {
    localStorage.setItem('appearance', 'light')
    localStorage.setItem('leonetlab:appearance:user-override', '1')
  })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  await expect(page.getByText('Tokyo Fixture', { exact: true })).toBeVisible()

  const result = await page.locator('[data-action="toggleTheme"]').evaluate(async (button) => {
    let starts = 0
    let ends = 0
    window.addEventListener('leonetlab:theme-transition-start', () => starts += 1)
    window.addEventListener('leonetlab:theme-transition-end', () => ends += 1)
    ;(button as HTMLButtonElement).click()
    await new Promise(resolve => setTimeout(resolve, 40))
    ;(button as HTMLButtonElement).click()
    ;(button as HTMLButtonElement).click()
    await new Promise(resolve => setTimeout(resolve, 1800))
    return {
      starts,
      ends,
      appearance: localStorage.getItem('appearance'),
      dark: document.documentElement.classList.contains('dark'),
      active: document.documentElement.classList.contains('lnl-theme-transitioning'),
    }
  })

  expect(result.starts).toBe(2)
  expect(result.ends).toBe(2)
  expect(result.appearance).toBe('light')
  expect(result.dark).toBe(false)
  expect(result.active).toBe(false)
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
