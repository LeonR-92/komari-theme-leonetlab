import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('komari-observatory:intro:1.6.0', 'seen')
    localStorage.setItem('appearance', 'light')
    localStorage.setItem('leonetlab:appearance:user-override', '1')
  })
})

test('keeps two-line Ping probes readable across compact and desktop layouts', async ({ page }, testInfo) => {
  const viewports = testInfo.project.name === 'chromium-desktop'
    ? [{ width: 320, height: 720 }, { width: 390, height: 844 }, { width: 820, height: 768 }, { width: 1440, height: 900 }, { width: 844, height: 390 }]
    : [testInfo.project.use.viewport!]
  await page.route('**/api/rpc2', async (route) => {
    const request = route.request().postDataJSON()
    if (request?.method !== 'public:getPingMetricStats')
      return route.continue()
    const response = await route.fetch()
    const data = await response.json()
    data.result.stats[0].name = 'North America · unusually long probe name for a narrow screen'
    data.result.stats[0].p99_p50_ratio = null
    data.result.stats[1].name = 'North America · unusually long probe name for a narrow screen'
    data.result.stats[1].latest = -1
    data.result.stats[1].loss = null
    await route.fulfill({ response, json: data })
  })
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await page.getByRole('button', { name: /延迟.+查看 Tokyo Fixture Ping 详情/ }).click()
    const probes = page.locator('.lnl-ping-probe')
    await expect(probes).toHaveCount(3)
    const sizes = await probes.evaluateAll(elements => elements.map((element) => {
      const name = element.querySelector('.lnl-ping-probe-copy')!.getBoundingClientRect()
      const value = element.querySelector('.lnl-ping-probe-value')!.getBoundingClientRect()
      const rect = element.getBoundingClientRect()
      return { width: rect.width, height: rect.height, right: rect.right, nameBottom: name.bottom, valueTop: value.top, overflow: element.scrollWidth - element.clientWidth }
    }))
    expect(sizes.every(size => size.height >= 44 && size.overflow <= 1 && size.nameBottom <= size.valueTop + 1)).toBe(true)
    expect(Math.max(...sizes.map(size => size.width)) - Math.min(...sizes.map(size => size.width))).toBeLessThanOrEqual(1)
    expect(sizes.every(size => size.right <= viewport.width)).toBe(true)
    await expect(probes.nth(1)).toContainText('丢包 —')
    await probes.nth(1).click()
    await expect(probes.nth(1)).toHaveAttribute('aria-pressed', 'false')
    await expect(probes.first()).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: '查看探测线路统计说明' }).click()
    await expect(page.locator('.lnl-ping-probe-detail').first()).toContainText('JIT —')
    if (testInfo.project.name === 'chromium-desktop' && (viewport.width === 390 || viewport.width === 1440)) {
      await page.getByRole('button', { name: '查看探测线路统计说明' }).click()
      await expect.poll(() => probes.first().evaluate(element => element.getAnimations().every(animation => animation.playState === 'finished'))).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`ping-${viewport.width}.png`) })
    }
  }
})

for (const fallback of [false, true]) {
  test(`merges rapid appearance intent and settles every transition (${fallback ? 'fallback' : 'native'})`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'One engine covers both transition backends deterministically.')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    if (fallback)
      await page.addInitScript(() => Object.defineProperty(document, 'startViewTransition', { configurable: true, value: undefined }))
    await page.goto('/')
    await page.getByRole('button', { name: '外观设置', exact: true }).click()
    await page.locator('[data-theme-mode="dark"]').evaluate(async (button) => {
      ;(button as HTMLButtonElement).click()
      await new Promise(resolve => setTimeout(resolve, 40))
      ;(document.querySelector('[data-theme-mode="light"]') as HTMLButtonElement).click()
      ;(document.querySelector('[data-color-palette="cobalt"]') as HTMLButtonElement).click()
      ;(document.querySelector('[data-cursor-style="native"]') as HTMLButtonElement).click()
    })
    await expect.poll(() => page.locator('html').getAttribute('data-palette')).toBe('cobalt')
    await expect(page.locator('html')).not.toHaveClass(/dark/)
    await expect(page.locator('html')).not.toHaveClass(/lnl-theme-transitioning/)
    await expect(page.locator('[data-cursor-style="native"]')).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: '关闭外观设置' }).click()
    await expect(page.getByRole('button', { name: '外观设置', exact: true })).toBeFocused()
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-palette', 'cobalt')
    await expect(page.locator('html')).not.toHaveClass(/dark/)
  })
}

test('keeps appearance controls touchable in short screens and returns keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 360 })
  await page.goto('/')
  const trigger = page.getByRole('button', { name: '外观设置', exact: true })
  await trigger.click()
  await expect(page.locator('[data-theme-mode="light"]')).toBeFocused()
  const geometry = await page.locator('.lnl-appearance-panel').evaluate(panel => ({
    bottom: panel.getBoundingClientRect().bottom,
    viewport: innerHeight,
    heights: Array.from(panel.querySelectorAll('button'), button => button.offsetHeight),
  }))
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewport)
  expect(geometry.heights.every(height => height >= 44)).toBe(true)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: '外观设置' })).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test('draws intermediate Ping frames on mobile and stops after settling', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Mobile previously disabled all line animation.')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.addInitScript(() => {
    const target = window as typeof window & { pingDrawTimes: number[] }
    target.pingDrawTimes = []
    const original = CanvasRenderingContext2D.prototype.stroke
    CanvasRenderingContext2D.prototype.stroke = function (...args: Parameters<typeof original>) {
      if (this.canvas.closest('.lnl-ping-chart'))
        target.pingDrawTimes.push(performance.now())
      return original.apply(this, args)
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: /延迟.+查看 Tokyo Fixture Ping 详情/ }).click()
  await expect(page.locator('.lnl-ping-chart canvas')).toBeVisible()
  await expect.poll(() => page.evaluate(() => {
    const times = (window as typeof window & { pingDrawTimes: number[] }).pingDrawTimes
    return new Set(times.map(time => Math.floor(time / 50))).size
  })).toBeGreaterThanOrEqual(4)
  await expect.poll(() => page.evaluate(() => {
    const times = (window as typeof window & { pingDrawTimes: number[] }).pingDrawTimes
    return performance.now() - (times.at(-1) ?? performance.now())
  })).toBeGreaterThan(400)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: '清空', exact: true }).click()
  await page.getByRole('button', { name: '全选', exact: true }).click()
  await expect(page.locator('.lnl-ping-probe').first()).toHaveAttribute('aria-pressed', 'true')
})

test('times out a stalled RPC body and recovers the node list', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'One HTTP transport regression covers the common client.')
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window)
    const nativeTimeout = window.setTimeout.bind(window)
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => nativeTimeout(handler, timeout === 30_000 ? 600 : timeout, ...args)) as typeof window.setTimeout
    let interrupted = false
    window.fetch = async (input, init) => {
      const response = await nativeFetch(input, init)
      const method = typeof init?.body === 'string' ? JSON.parse(init.body).method : ''
      if (method !== 'common:getNodes' || interrupted)
        return response
      interrupted = true
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"jsonrpc":"2.0","result":'))
          init?.signal?.addEventListener('abort', () => {
            controller.error(new DOMException('Fixture response body timeout', 'AbortError'))
            document.documentElement.dataset.rpcBodyTimedOut = 'true'
          }, { once: true })
        },
      }), { headers: { 'Content-Type': 'application/json' } })
    }
  })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-rpc-body-timed-out', 'true')
  await expect(page.locator('.lnl-node-title').filter({ hasText: 'Tokyo Fixture' })).toBeVisible({ timeout: 15_000 })
})

test('keeps full statistics scrollable for many Ping probes', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'A short mobile viewport exercises the detail overflow boundary.')
  await page.route('**/api/rpc2', async (route) => {
    if (route.request().postDataJSON()?.method !== 'public:getPingMetricStats')
      return route.continue()
    const response = await route.fetch()
    const data = await response.json()
    const seed = data.result.stats[0]
    data.result.stats = Array.from({ length: 20 }, (_, index) => ({ ...seed, task_id: String(index + 1), name: `Long distance probe ${index + 1} · Full statistics` }))
    await route.fulfill({ response, json: data })
  })
  await page.goto('/')
  await page.getByRole('button', { name: /延迟.+查看 Tokyo Fixture Ping 详情/ }).click()
  await expect(page.locator('.lnl-ping-probe')).toHaveCount(20)
  await page.getByRole('button', { name: '查看探测线路统计说明' }).click()
  const details = page.getByRole('dialog', { name: '查看探测线路统计说明' })
  await expect(details).toBeVisible()
  const bounds = await details.evaluate(element => ({
    top: element.getBoundingClientRect().top,
    bottom: element.getBoundingClientRect().bottom,
    height: innerHeight,
    scrolls: (() => {
      const scroller = element.querySelector('.lnl-ping-probe-details')!
      return scroller.scrollHeight > scroller.clientHeight
    })(),
  }))
  expect(bounds.top).toBeGreaterThanOrEqual(0)
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.height)
  expect(bounds.scrolls).toBe(true)
  await page.getByRole('button', { name: '关闭探测线路统计' }).click()
  await expect(details).toHaveCount(0)
})
