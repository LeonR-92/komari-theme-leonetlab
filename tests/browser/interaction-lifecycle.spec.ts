import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('komari-observatory:intro:1.6.0', 'seen')
    localStorage.setItem('nodeViewMode', 'card')
  })
})

test('preserves the last view intent and cancels delayed search focus on navigation', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.lnl-node-title').first()).toBeVisible()
  await page.getByRole('button', { name: '卡片视图', exact: true }).click()
  await page.getByRole('button', { name: '列表视图', exact: true }).evaluate((button) => {
    ;(button as HTMLButtonElement).click()
    ;(document.querySelector('button[aria-label="卡片视图"]') as HTMLButtonElement).click()
  })
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await expect(page.getByRole('button', { name: '卡片视图', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.node-card').first()).toBeVisible()

  await page.locator('button[aria-controls="node-search"]').evaluate((button) => {
    ;(button as HTMLButtonElement).click()
    history.pushState({}, '', '/instance/fixture-node-b')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page).toHaveURL(/instance\/fixture-node-b/)
  await expect(page.locator('.lnl-detail')).toBeVisible()
  await expect(page.locator('#node-search')).toHaveCount(0)
  await page.locator('.lnl-identity').click()
  await expect(page.locator('.node-card').first()).toBeVisible()
  await expect(page.getByRole('button', { name: '卡片视图', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('keeps cleared and custom Ping intent through refresh and missing ranges', async ({ page }, testInfo) => {
  // Six foreground range changes and a live refresh need more total time in
  // software-rendered WebKit CI; keep the individual assertions unchanged.
  if (testInfo.project.name === 'webkit-tablet')
    test.setTimeout(60_000)
  let statsRequests = 0
  let missingFirst = false
  await page.addInitScript(() => {
    const interval = window.setInterval.bind(window)
    window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => interval(handler, timeout === 15_000 ? 500 : timeout, ...args)) as typeof window.setInterval
  })
  await page.route('**/api/rpc2', async (route) => {
    if (route.request().postDataJSON()?.method !== 'public:getPingMetricStats')
      return route.continue()
    statsRequests += 1
    const response = await route.fetch()
    const data = await response.json()
    if (missingFirst)
      data.result.stats.shift()
    await route.fulfill({ response, json: data })
  })
  await page.goto('/')
  await page.getByRole('button', { name: /延迟.+查看 Tokyo Fixture Ping 详情/ }).click()
  const probes = page.locator('.lnl-ping-probe')
  await expect(probes).toHaveCount(3)
  const firstId = await probes.first().getAttribute('data-ping-task-id')
  for (let index = 0; index < 3; index++)
    await probes.nth(index).click()
  const beforeRefresh = statsRequests
  await expect.poll(() => statsRequests).toBeGreaterThan(beforeRefresh)
  await expect(page.locator('.lnl-ping-probe[aria-pressed="true"]')).toHaveCount(0)
  await page.getByRole('tab', { name: '6 小时', exact: true }).click()
  await expect(page.locator('.lnl-ping-probe[aria-pressed="true"]')).toHaveCount(0)

  await page.getByRole('button', { name: '全选', exact: true }).click()
  await expect(page.locator('.lnl-ping-probe[aria-pressed="true"]')).toHaveCount(3)
  await probes.nth(1).click()
  await probes.nth(2).click()
  missingFirst = true
  await page.getByRole('tab', { name: '1 小时', exact: true }).click()
  await expect(probes).toHaveCount(2)
  await expect(page.locator('.lnl-ping-probe[aria-pressed="true"]')).toHaveCount(0)
  missingFirst = false
  await page.getByRole('tab', { name: '6 小时', exact: true }).click()
  await expect(probes).toHaveCount(3)
  await expect(page.locator(`.lnl-ping-probe[data-ping-task-id="${firstId}"]`)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.lnl-ping-probe[aria-pressed="true"]')).toHaveCount(1)
  // Clearing the remaining visible probes also supersedes older, unavailable IDs.
  missingFirst = true
  await page.getByRole('tab', { name: '1 小时', exact: true }).click()
  await expect(probes).toHaveCount(2)
  await probes.first().click()
  await probes.first().click()
  missingFirst = false
  await page.getByRole('tab', { name: '6 小时', exact: true }).click()
  await expect(probes).toHaveCount(3)
  await expect(page.locator('.lnl-ping-probe[aria-pressed="true"]')).toHaveCount(0)
})

test('closes cached homepage Ping and stops its requests after route navigation', async ({ page }) => {
  let homepageRequests = 0
  await page.addInitScript(() => {
    const interval = window.setInterval.bind(window)
    window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => interval(handler, timeout === 15_000 ? 500 : timeout, ...args)) as typeof window.setInterval
  })
  page.on('request', (request) => {
    if (!request.url().endsWith('/api/rpc2') || request.method() !== 'POST')
      return
    const body = request.postDataJSON()
    if (body?.method === 'public:getPingMetricStats' && body.params?.uuid === 'fixture-node-a')
      homepageRequests += 1
  })
  await page.goto('/')
  await page.getByRole('button', { name: /延迟.+查看 Tokyo Fixture Ping 详情/ }).click()
  await expect(page.locator('.lnl-ping-probe')).toHaveCount(3)
  await page.evaluate(() => {
    history.pushState({}, '', '/instance/fixture-node-b')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.locator('.lnl-detail')).toBeVisible()
  await expect(page.locator('.lnl-ping-dialog')).toHaveCount(0)
  const count = homepageRequests
  await page.waitForTimeout(1100)
  expect(homepageRequests).toBe(count)
  await page.locator('.lnl-identity').click()
  await expect(page.locator('.node-card').first()).toBeVisible()
  await expect(page.locator('.lnl-ping-dialog')).toHaveCount(0)
})

test('recovers a foreground Ping error during quiet background refresh', async ({ page }) => {
  let requests = 0
  await page.addInitScript(() => {
    const interval = window.setInterval.bind(window)
    window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => interval(handler, timeout === 15_000 ? 1000 : timeout, ...args)) as typeof window.setInterval
  })
  await page.route('**/api/rpc2', async (route) => {
    const body = route.request().postDataJSON()
    if (body?.method === 'public:getPingMetricStats' && ++requests === 1)
      return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, error: { code: -32603, message: 'Fixture ordinary failure' } } })
    return route.continue()
  })
  await page.goto('/')
  await page.getByRole('button', { name: /延迟.+查看 Tokyo Fixture Ping 详情/ }).click()
  await expect(page.getByText('Fixture ordinary failure', { exact: true })).toBeVisible()
  await expect(page.locator('.lnl-ping-probe')).toHaveCount(3)
  await expect(page.getByText('Fixture ordinary failure', { exact: true })).toHaveCount(0)
})

test('preserves legend clearing and pauses Ping requests while hidden', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'One engine covers ECharts event ownership and the visibility gate.')
  let statsRequests = 0
  await page.addInitScript(() => {
    const interval = window.setInterval.bind(window)
    window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => interval(handler, timeout === 15_000 ? 500 : timeout, ...args)) as typeof window.setInterval
  })
  page.on('request', (request) => {
    if (request.url().endsWith('/api/rpc2') && request.method() === 'POST' && request.postDataJSON()?.method === 'public:getPingMetricStats')
      statsRequests += 1
  })
  await page.goto('/')
  await page.getByRole('button', { name: /延迟.+查看 Tokyo Fixture Ping 详情/ }).click()
  await expect(page.locator('.lnl-ping-chart canvas')).toBeVisible()
  const ids = await page.locator('.lnl-ping-probe').evaluateAll(elements => elements.map(element => element.getAttribute('data-ping-task-id')!))
  const found = await page.evaluate(async (ids) => {
    interface ChartVNode {
      component?: {
        exposed?: { root?: { value?: Element }, dispatchAction?: (action: { type: string, name: string }) => void }
        subTree?: ChartVNode
      }
      children?: ChartVNode[]
      suspense?: { activeBranch?: ChartVNode }
    }
    // Use vue-echarts' exposed dispatch API rather than relying on canvas pixel coordinates.
    const root = document.querySelector('#app') as Element & { _vnode: ChartVNode }
    const stack = [root._vnode]
    while (stack.length) {
      const node = stack.pop()!
      const api = node.component?.exposed
      if (api?.dispatchAction && api.root?.value?.closest('.lnl-ping-chart')) {
        for (const id of ids) {
          api.dispatchAction({ type: 'legendToggleSelect', name: id })
          await new Promise(resolve => requestAnimationFrame(resolve))
        }
        return true
      }
      if (node.component?.subTree)
        stack.push(node.component.subTree)
      if (Array.isArray(node.children))
        stack.push(...node.children.filter(child => child && typeof child === 'object'))
      if (node.suspense?.activeBranch)
        stack.push(node.suspense.activeBranch)
    }
    return false
  }, ids)
  expect(found).toBe(true)
  await expect(page.locator('.lnl-ping-probe[aria-pressed="true"]')).toHaveCount(0)
  const beforeRefresh = statsRequests
  await expect.poll(() => statsRequests).toBeGreaterThan(beforeRefresh)
  await expect(page.locator('.lnl-ping-probe[aria-pressed="true"]')).toHaveCount(0)

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  const hiddenRequests = statsRequests
  await page.waitForTimeout(1100)
  expect(statsRequests).toBe(hiddenRequests)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect.poll(() => statsRequests).toBeGreaterThan(hiddenRequests)
  await expect(page.locator('.lnl-ping-probe[aria-pressed="true"]')).toHaveCount(0)
})

test('aborts visitor lookup without fallback work after component unmount', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'One deterministic request-owner regression covers all devices.')
  await page.route('**/api/public', async (route) => {
    const response = await route.fetch()
    const data = await response.json()
    data.data.theme_settings.visitorInfoCardEnabled = true
    await route.fulfill({ response, json: data })
  })
  await page.addInitScript(() => {
    const original = window.fetch.bind(window)
    let requests = 0
    window.fetch = (input, init) => {
      const url = String(input)
      if (!/api\.ip\.sb\/geoip|ipwho\.is|api\.ipapi\.is|ipapi\.co|api\.vore\.top/.test(url))
        return original(input, init)
      document.documentElement.dataset.visitorRequests = String(++requests)
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          document.documentElement.dataset.visitorAborted = 'true'
          reject(new DOMException('Fixture cancellation', 'AbortError'))
        }, { once: true })
      })
    }
  })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-visitor-requests', '1')
  await page.evaluate(() => {
    const root = document.querySelector('#app') as Element & { __vue_app__: { unmount: () => void } }
    root.__vue_app__.unmount()
  })
  await expect(page.locator('html')).toHaveAttribute('data-visitor-aborted', 'true')
  await page.waitForTimeout(200)
  await expect(page.locator('html')).toHaveAttribute('data-visitor-requests', '1')
})
