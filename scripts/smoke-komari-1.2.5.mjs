import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, resolve, sep } from 'node:path'
import process from 'node:process'

const root = resolve(import.meta.dirname, '..')
const dist = resolve(root, 'dist')
const visualAuditEnabled = Boolean(process.env.SMOKE_SCREENSHOT_DIR)
const financeDetailsLabelPattern = /查看财务汇率详情/
const nodeUuid = 'fixture-node-a'
const secondNodeUuid = 'fixture-node-b'
function client(uuid, name, region, weight) {
  return {
    uuid,
    name,
    cpu_name: 'Fixture CPU',
    virtualization: 'kvm',
    arch: 'amd64',
    cpu_cores: 4,
    os: 'Debian GNU/Linux 12',
    kernel_version: '6.1.0',
    region,
    public_remark: 'Komari 1.2.5 compatibility fixture',
    mem_total: 8_589_934_592,
    swap_total: 2_147_483_648,
    disk_total: 107_374_182_400,
    weight,
    price: -1,
    billing_cycle: 30,
    auto_renewal: false,
    currency: 'CNY',
    expired_at: '',
    group: 'Fixture',
    tags: 'compatibility',
    hidden: false,
    traffic_limit: 0,
    traffic_limit_type: 'sum',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}
const clients = [
  client(nodeUuid, 'Tokyo Fixture', 'JP', 20),
  client(secondNodeUuid, 'Frankfurt Fixture', 'DE', 10),
]
clients[0].price = 30
clients[0].expired_at = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
function status(uuid, cpu) {
  return {
    client: uuid,
    time: '2026-07-20T08:00:00Z',
    cpu,
    gpu: 0,
    ram: 2_147_483_648,
    ram_total: 8_589_934_592,
    swap: 0,
    swap_total: 2_147_483_648,
    load: 0.28,
    load5: 0.24,
    load15: 0.2,
    temp: 41,
    disk: 21_474_836_480,
    disk_total: 107_374_182_400,
    net_in: 2048,
    net_out: 1024,
    net_total_up: 100_000,
    net_total_down: 200_000,
    process: 88,
    connections: 21,
    connections_udp: 3,
    online: true,
    uptime: 86400,
    ping: uuid === nodeUuid
      ? {
          1: {
            name: 'Tokyo route probe',
            latest: 67,
            avg: 54,
            tail: 62,
            loss: 4.17,
            min: 42,
            max: 67,
          },
        }
      : {},
  }
}
const statuses = {
  [nodeUuid]: status(nodeUuid, 18),
  [secondNodeUuid]: status(secondNodeUuid, 24),
}
const historyRecords = Array.from({ length: 24 }, (_, index) => ({
  ...status(nodeUuid, 12 + index * 0.35),
  time: new Date(Date.parse('2026-07-20T08:00:00Z') - (23 - index) * 10 * 60_000).toISOString(),
  ram: 2_000_000_000 + index * 4_000_000,
  net_in: 2048 + index * 32,
  net_out: 1024 + index * 24,
}))
const pingRecords = Array.from({ length: 24 }, (_, index) => ({
  client: nodeUuid,
  task_id: 1,
  time: new Date(Date.parse('2026-07-20T08:00:00Z') - (23 - index) * 5 * 60_000).toISOString(),
  value: index === 8 ? -1 : 42 + (index % 6) * 5,
}))
const pingTasks = [{
  id: 1,
  name: 'Tokyo route probe',
  interval: 300,
  loss: 4.17,
  min: 42,
  max: 67,
  avg: 54,
  latest: 67,
  total: pingRecords.length,
  type: 'icmp',
}]
const dialogPingTasks = [
  ...pingTasks,
  {
    id: 2,
    name: '联通',
    interval: 60,
    loss: 0,
    min: 56,
    max: 91,
    avg: 73,
    latest: 87,
    total: pingRecords.length,
    type: 'tcp',
    p99_p50_ratio: 0.84,
  },
  {
    id: 3,
    name: '移动',
    interval: 60,
    loss: 0,
    min: 45,
    max: 68,
    avg: 57,
    latest: 58,
    total: pingRecords.length,
    type: 'tcp',
    p99_p50_ratio: 0.82,
  },
]
const dialogPingRecords = [
  ...pingRecords,
  ...pingRecords.map(record => ({ ...record, task_id: 2, value: record.value < 0 ? 72 : record.value + 20 })),
  ...pingRecords.map(record => ({ ...record, task_id: 3, value: record.value < 0 ? 56 : record.value + 3 })),
]
const rpcCalls = []
let defaultThemeModeFixture = 'system'
let visitorInfoEnabledFixture = false
const leadingSlashesPattern = /^\/+/
const lineBreakPattern = /\r?\n/

async function readDevToolsPort(activePortFile, deadline) {
  let lastError
  while (Date.now() < deadline) {
    try {
      const [port] = readFileSync(activePortFile, 'utf8').trim().split(lineBreakPattern)
      if (port)
        return port
    }
    catch (error) {
      lastError = error
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 50))
  }
  throw lastError ?? new Error('Chrome DevTools port file stayed empty')
}

const mime = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

function json(response, payload) {
  response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1')
  if (url.pathname === '/api/public') {
    json(response, {
      status: 'success',
      message: '',
      data: {
        sitename: 'LeoNetLab Fixture',
        description: 'Compatibility smoke test',
        private_site: false,
        record_enabled: true,
        theme: 'LeoNetLab',
        theme_settings: {
          rpcTransportMode: 'http',
          defaultThemeMode: defaultThemeModeFixture,
          earthViewMode: 'earth',
          visitorInfoCardEnabled: visitorInfoEnabledFixture,
          icpEnabled: visualAuditEnabled,
          icpNumber: visualAuditEnabled ? 'ICP 备案示例' : '',
          icpUrl: 'https://beian.miit.gov.cn/',
          policeEnabled: visualAuditEnabled,
          policeNumber: visualAuditEnabled ? '公安备案示例' : '',
          policeUrl: 'https://www.beian.gov.cn/',
        },
      },
    })
    return
  }
  if (url.pathname === '/api/me') {
    json(response, { username: 'Guest', logged_in: false })
    return
  }
  if (url.pathname === '/api/rpc2' && request.method === 'POST') {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', chunk => body += chunk)
    request.on('end', () => {
      const rpcRequest = JSON.parse(body)
      rpcCalls.push({ method: rpcRequest.method, params: rpcRequest.params })
      const results = {
        'rpc.ping': 'pong',
        // This array is the exact collection shape used by Komari 1.2.5-fix1.
        'common:getNodes': clients,
        'common:getNodesLatestStatus': statuses,
        'common:getNodeRecentStatus': { count: historyRecords.length, records: historyRecords },
      }
      let result = results[rpcRequest.method]
      if (rpcRequest.method === 'common:getRecords') {
        const isNodePingDialog = rpcRequest.params?.type === 'ping' && Boolean(rpcRequest.params?.uuid)
        result = rpcRequest.params?.type === 'ping'
          ? isNodePingDialog
            ? { count: dialogPingRecords.length, records: dialogPingRecords, tasks: dialogPingTasks }
            : { count: pingRecords.length, records: pingRecords, tasks: pingTasks }
          : { count: historyRecords.length, records: { [nodeUuid]: historyRecords }, from: historyRecords[0].time, to: historyRecords.at(-1).time }
      }
      if (result === undefined) {
        json(response, {
          jsonrpc: '2.0',
          id: rpcRequest.id,
          error: { code: -32601, message: 'Method not found' },
        })
        return
      }
      json(response, { jsonrpc: '2.0', id: rpcRequest.id, result })
    })
    return
  }

  const requested = url.pathname === '/' ? 'index.html' : url.pathname.replace(leadingSlashesPattern, '')
  const requestedFile = resolve(dist, requested)
  const file = existsSync(requestedFile) ? requestedFile : resolve(dist, 'index.html')
  if (!file.startsWith(`${dist}${sep}`) || !existsSync(file)) {
    response.writeHead(404)
    response.end('Not found')
    return
  }
  response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' })
  response.end(readFileSync(file))
})

const browserCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean)
const browser = browserCandidates.find(existsSync)
assert.ok(browser, 'Chrome or Edge is required for the integration smoke test')

await new Promise((resolveListen, rejectListen) => {
  server.once('error', rejectListen)
  server.listen(0, '127.0.0.1', resolveListen)
})

const address = server.address()
assert.ok(address && typeof address === 'object')
const profile = resolve(tmpdir(), `leonetlab-komari-smoke-${process.pid}`)

async function dumpDom(name, path, virtualTimeBudget = 6000) {
  const dumpProfile = `${profile}-${name}`
  try {
    return await new Promise((resolveRun, rejectRun) => {
      const child = spawn(browser, [
        '--headless=new',
        '--disable-gpu',
        '--disable-features=SkiaGraphite',
        '--no-sandbox',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${dumpProfile}`,
        `--virtual-time-budget=${virtualTimeBudget}`,
        '--dump-dom',
        `http://127.0.0.1:${address.port}${path}`,
      ], { windowsHide: true })
      let stdout = ''
      let stderr = ''
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', chunk => stdout += chunk)
      child.stderr.on('data', chunk => stderr += chunk)
      child.once('error', rejectRun)
      child.once('close', (code) => {
        if (code === 0)
          resolveRun(stdout)
        else
          rejectRun(new Error(`Headless browser exited with ${code}: ${stderr.slice(-800)}`))
      })
    })
  }
  finally {
    rmSync(dumpProfile, { recursive: true, force: true })
  }
}

async function captureScreenshot(name, width, height, path, virtualTimeBudget, extraBrowserArgs = []) {
  const screenshotProfile = `${profile}-${name}`
  const screenshotDir = process.env.SMOKE_SCREENSHOT_DIR
  assert.ok(screenshotDir)
  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(browser, [
      '--headless=new',
      '--disable-gpu',
      '--disable-features=SkiaGraphite',
      '--no-sandbox',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${screenshotProfile}`,
      `--window-size=${width},${height}`,
      `--virtual-time-budget=${virtualTimeBudget}`,
      `--screenshot=${resolve(screenshotDir, `${name}.png`)}`,
      ...extraBrowserArgs,
      `http://127.0.0.1:${address.port}${path}`,
    ], { windowsHide: true })
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', chunk => stderr += chunk)
    child.once('error', rejectRun)
    child.once('close', (code) => {
      rmSync(screenshotProfile, { recursive: true, force: true })
      if (code === 0)
        resolveRun()
      else
        rejectRun(new Error(`Screenshot browser exited with ${code}: ${stderr.slice(-800)}`))
    })
  })
}

async function runInteractivePage(name, width, height, expression, screenshotName, initScript) {
  const screenshotProfile = `${profile}-${name}`
  const screenshotDir = process.env.SMOKE_SCREENSHOT_DIR

  const child = spawn(browser, [
    '--headless=new',
    '--disable-gpu',
    '--disable-features=SkiaGraphite',
    '--no-sandbox',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    `--user-data-dir=${screenshotProfile}`,
    `--window-size=${width},${height}`,
    'about:blank',
  ], { windowsHide: true })

  let socket
  try {
    const activePortFile = resolve(screenshotProfile, 'DevToolsActivePort')
    const deadline = Date.now() + 10_000
    while (!existsSync(activePortFile) && Date.now() < deadline)
      await new Promise(resolveWait => setTimeout(resolveWait, 50))
    assert.ok(existsSync(activePortFile), 'Chrome DevTools port was not created')

    const port = await readDevToolsPort(activePortFile, deadline)
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json())
    const target = targets.find(item => item.type === 'page')
    assert.ok(target?.webSocketDebuggerUrl, 'Chrome page target was not available')

    socket = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolveOpen, rejectOpen) => {
      socket.addEventListener('open', resolveOpen, { once: true })
      socket.addEventListener('error', rejectOpen, { once: true })
    })

    let commandId = 0
    const pending = new Map()
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data))
      const entry = pending.get(message.id)
      if (!entry)
        return
      pending.delete(message.id)
      if (message.error)
        entry.reject(new Error(message.error.message))
      else
        entry.resolve(message.result)
    })

    const command = (method, params = {}) => new Promise((resolveCommand, rejectCommand) => {
      const id = ++commandId
      pending.set(id, { resolve: resolveCommand, reject: rejectCommand })
      socket.send(JSON.stringify({ id, method, params }))
    })

    await command('Page.enable')
    if (initScript) {
      await command('Page.addScriptToEvaluateOnNewDocument', { source: initScript })
    }
    await command('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width <= 760,
      screenWidth: width,
      screenHeight: height,
    })
    await command('Page.navigate', { url: `http://127.0.0.1:${address.port}/` })
    await new Promise(resolveWait => setTimeout(resolveWait, 500))
    const evaluated = await command('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression,
    })

    if (screenshotName) {
      assert.ok(screenshotDir)
      await new Promise(resolveWait => setTimeout(resolveWait, 900))
      const screenshot = await command('Page.captureScreenshot', { format: 'png', fromSurface: true })
      writeFileSync(resolve(screenshotDir, `${screenshotName}.png`), Buffer.from(screenshot.data, 'base64'))
    }

    return evaluated.result?.value
  }
  finally {
    socket?.close()
    if (child.exitCode === null) {
      const closed = new Promise(resolveClose => child.once('close', resolveClose))
      child.kill()
      await Promise.race([
        closed,
        new Promise(resolveWait => setTimeout(resolveWait, 3000)),
      ])
    }
    rmSync(screenshotProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

const pingDialogOpenExpression = `new Promise((resolve) => {
  const deadline = Date.now() + 12000;
  const timer = setInterval(() => {
    const button = document.querySelector('[role="button"][aria-label^="Tokyo Fixture"]');
    if (button) {
      clearInterval(timer);
      button.click();
      const dialogDeadline = Date.now() + 5000;
      const dialogTimer = setInterval(() => {
        const chart = document.querySelector('.lnl-ping-chart .echarts');
        const chartRect = chart?.getBoundingClientRect();
        const dialog = document.querySelector('.lnl-ping-dialog[data-state="open"]');
        const dialogRect = dialog?.getBoundingClientRect();
        if (document.querySelector('.lnl-ping-workspace') && dialogRect && chartRect?.width > 100 && chartRect?.height > 200) {
          clearInterval(dialogTimer);
          resolve({
            state: 'opened',
            left: dialogRect.left,
            right: dialogRect.right,
            width: dialogRect.width,
            viewportWidth: document.documentElement.clientWidth,
            centerError: Math.abs((dialogRect.left + dialogRect.right) / 2 - document.documentElement.clientWidth / 2),
          });
        }
        else if (Date.now() >= dialogDeadline) {
          clearInterval(dialogTimer);
          resolve('dialog-timeout');
        }
      }, 80);
    }
    else if (Date.now() >= deadline) {
      clearInterval(timer);
      resolve('button-timeout');
    }
  }, 100);
})`

const financeOverflowAuditExpression = `new Promise((resolve) => {
  const deadline = Date.now() + 12000;
  const timer = setInterval(() => {
    const button = document.querySelector('[data-finance-trigger]');
    if (button) {
      clearInterval(timer);
      button.click();
      setTimeout(() => {
        const popover = document.querySelector('[data-finance-popover]');
        const rect = popover?.getBoundingClientRect();
        const viewportWidth = document.documentElement.clientWidth;
        resolve({
          state: popover?.classList.contains('is-open') ? 'opened' : 'closed',
          triggerText: button.textContent?.replace(/\s+/g, ' ').trim() || '',
          textFits: [...button.querySelectorAll('span')].every((span) => {
            const spanRect = span.getBoundingClientRect();
            const buttonRect = button.getBoundingClientRect();
            return spanRect.bottom <= buttonRect.bottom + 0.5 && spanRect.right <= buttonRect.right + 0.5;
          }),
          viewportWidth,
          documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
          left: rect?.left ?? -1,
          right: rect?.right ?? -1,
        });
      }, 420);
    }
    else if (Date.now() >= deadline) {
      clearInterval(timer);
      resolve({ state: 'button-timeout' });
    }
  }, 100);
})`

const pingBarGeometryAuditExpression = `new Promise((resolve) => {
  const deadline = Date.now() + 12000;
  const timer = setInterval(() => {
    const card = document.querySelector('.node-card');
    const latencyPanel = card?.querySelector('[data-node-ping-panel="latency"]');
    const lossPanel = card?.querySelector('[data-node-ping-panel="loss"]');
    const panels = [latencyPanel, lossPanel];
    const ready = panels.every((panel) => panel?.querySelectorAll('[data-node-ping-bar]').length === 10);
    if (ready) {
      clearInterval(timer);
      resolve(panels.map((panel) => {
        const panelRect = panel.getBoundingClientRect();
        const cardRect = panel.closest('.node-card')?.getBoundingClientRect();
        const bars = [...panel.querySelectorAll('[data-node-ping-bar]')].map((bar) => {
          const rect = bar.getBoundingClientRect();
          return {
            width: rect.width,
            height: rect.height,
            top: rect.top,
            bottom: rect.bottom,
            background: getComputedStyle(bar).backgroundColor,
          };
        });
        return {
          panelHeight: panelRect.height,
          cardTop: cardRect?.top ?? null,
          cardBottom: cardRect?.bottom ?? null,
          bars,
        };
      }));
    }
    else if (Date.now() >= deadline) {
      clearInterval(timer);
      resolve([]);
    }
  }, 100);
})`

const themeModeAuditExpression = `new Promise((resolve) => {
  const deadline = Date.now() + 8000;
  const expectedAppearance = '__EXPECTED_APPEARANCE__';
  const expectedDark = __EXPECTED_DARK__;
  const timer = setInterval(() => {
    const appearance = localStorage.getItem('appearance');
    const dark = document.documentElement.classList.contains('dark');
    const colorScheme = document.documentElement.style.colorScheme;
    if (appearance === expectedAppearance && dark === expectedDark && colorScheme === (expectedDark ? 'dark' : 'light')) {
      clearInterval(timer);
      resolve({
        appearance,
        override: localStorage.getItem('leonetlab:appearance:user-override'),
        dark,
        colorScheme,
      });
    }
    else if (Date.now() >= deadline) {
      clearInterval(timer);
      resolve({ appearance: 'timeout' });
    }
  }, 80);
})`

const globeFlagThemeAuditExpression = `new Promise((resolve) => {
  const deadline = Date.now() + 12000;
  const timer = setInterval(() => {
    const canvas = document.querySelector('.node-earth-globe:not(.is-intro) canvas');
    const globeContainer = document.querySelector('.node-earth-globe:not(.is-intro)');
    const overlays = [...document.querySelectorAll('.node-earth-globe:not(.is-intro) .lnl-earth-overlay')];
    const themeButton = [...document.querySelectorAll('button')].find(button => /模式|北京时间/.test(button.getAttribute('aria-label') || ''));
    if (canvas && globeContainer && overlays.length === 2 && themeButton) {
      clearInterval(timer);
      const initialCanvas = canvas;
      const initialCount = overlays.length;
      const sample = () => {
        const current = [...document.querySelectorAll('.node-earth-globe:not(.is-intro) .lnl-earth-overlay')];
        const images = current.map(overlay => overlay.querySelector('img'));
        return {
          count: current.length,
          loaded: images.every(image => image?.complete && image.naturalWidth > 0),
          displayed: images.every(image => getComputedStyle(image).display !== 'none'),
        };
      };
      const samples = [sample()];
      themeButton.click();
      const start = performance.now();
      const capture = () => {
        samples.push(sample());
        if (performance.now() - start < 950) {
          requestAnimationFrame(capture);
          return;
        }
        const overlayTransformBeforeDrag = document.querySelector('.node-earth-globe:not(.is-intro) .lnl-earth-overlay')?.style.transform || '';
        const rect = canvas.getBoundingClientRect();
        globeContainer.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, clientX: rect.left + rect.width * 0.5, clientY: rect.top + rect.height * 0.5 }));
        const draggingStarted = globeContainer.classList.contains('is-dragging');
        globeContainer.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 7, clientX: rect.left + rect.width * 0.7, clientY: rect.top + rect.height * 0.52 }));
        const overlayTransformAfterMove = document.querySelector('.node-earth-globe:not(.is-intro) .lnl-earth-overlay')?.style.transform || '';
        globeContainer.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7, clientX: rect.left + rect.width * 0.7, clientY: rect.top + rect.height * 0.52 }));
        setTimeout(() => resolve({
          initialCount,
          canvasSame: initialCanvas === document.querySelector('.node-earth-globe:not(.is-intro) canvas'),
          minCount: Math.min(...samples.map(item => item.count)),
          allLoaded: samples.every(item => item.loaded),
          allDisplayed: samples.every(item => item.displayed),
          draggingStarted,
          transformBefore: overlayTransformBeforeDrag,
          transformAfterMove: overlayTransformAfterMove,
          overlayMoved: overlayTransformBeforeDrag !== (document.querySelector('.node-earth-globe:not(.is-intro) .lnl-earth-overlay')?.style.transform || ''),
          draggingEnded: !document.querySelector('.node-earth-globe:not(.is-intro)')?.classList.contains('is-dragging'),
        }), 120);
      };
      requestAnimationFrame(capture);
    }
    else if (Date.now() >= deadline) {
      clearInterval(timer);
      resolve({ state: 'timeout', overlays: overlays.length });
    }
  }, 80);
})`

const pingDialogCloseAuditExpression = `new Promise((resolve) => {
  const deadline = Date.now() + 12000;
  const timer = setInterval(() => {
    const trigger = document.querySelector('[role="button"][aria-label^="Tokyo Fixture"]');
    if (!trigger) {
      if (Date.now() >= deadline) {
        clearInterval(timer);
        resolve({ state: 'trigger-timeout' });
      }
      return;
    }
    clearInterval(timer);
    trigger.click();
    const openDeadline = Date.now() + 5000;
    const openTimer = setInterval(() => {
      const dialog = document.querySelector('.lnl-ping-dialog[data-state="open"]');
      const close = dialog?.querySelector('button[aria-label="关闭"]');
      if (dialog && close) {
        clearInterval(openTimer);
        close.click();
        let closedSeen = false;
        let closedFrames = 0;
        const started = performance.now();
        const sample = () => {
          const current = document.querySelector('.lnl-ping-dialog');
          if (current?.getAttribute('data-state') === 'closed') {
            closedSeen = true;
            closedFrames += 1;
          }
          if ((!current && closedSeen) || performance.now() - started > 600) {
            resolve({ state: current ? current.getAttribute('data-state') : 'removed', closedSeen, closedFrames });
            return;
          }
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }
      else if (Date.now() >= openDeadline) {
        clearInterval(openTimer);
        resolve({ state: 'dialog-timeout' });
      }
    }, 60);
  }, 80);
})`

const introHandoffAuditExpression = `new Promise((resolve) => {
  const deadline = Date.now() + 10000;
  const timer = setInterval(() => {
    const root = document.querySelector('.lnl-intro');
    const source = document.querySelector('.lnl-intro-globe');
    const target = document.querySelector('.lnl-summary .node-earth-globe:not(.is-intro)');
    const skip = document.querySelector('.lnl-intro-skip');
    if (root && source && target && skip) {
      clearInterval(timer);
      const sourceRect = source.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const staged = Boolean(document.querySelector('.lnl-intro-staged'));
      skip.click();
      setTimeout(() => {
        const style = root.style;
        const handoffX = Number.parseFloat(style.getPropertyValue('--intro-handoff-x'));
        const handoffY = Number.parseFloat(style.getPropertyValue('--intro-handoff-y'));
        const handoffScale = Number.parseFloat(style.getPropertyValue('--intro-handoff-scale'));
        resolve({
          handoffReady: root.classList.contains('is-handoff-ready'),
          staged,
          xError: Math.abs(handoffX - (targetRect.left - sourceRect.left)),
          yError: Math.abs(handoffY - (targetRect.top - sourceRect.top)),
          scaleError: Math.abs(handoffScale - targetRect.width / sourceRect.width),
        });
      }, 80);
    }
    else if (Date.now() >= deadline) {
      clearInterval(timer);
      resolve({ state: 'timeout', hasRoot: Boolean(root), hasSource: Boolean(source), hasTarget: Boolean(target) });
    }
  }, 60);
})`

const mobileChromeLayoutAuditExpression = `new Promise((resolve) => {
  const deadline = Date.now() + 12000;
  const intersects = (a, b) => Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
  const timer = setInterval(() => {
    const logo = document.querySelector('.lnl-identity-mark');
    const visitor = document.querySelector('.lnl-visitor-trigger');
    const backTop = document.querySelector('.lnl-back-top');
    if (logo && visitor && backTop) {
      clearInterval(timer);
      window.scrollTo(0, Math.min(500, document.documentElement.scrollHeight));
      setTimeout(() => {
        const logoRect = logo.getBoundingClientRect();
        const compactVisitorRect = visitor.getBoundingClientRect();
        const compactBackRect = backTop.getBoundingClientRect();
        visitor.click();
        setTimeout(() => {
          const expandedVisitorRect = visitor.getBoundingClientRect();
          const expandedBackRect = backTop.getBoundingClientRect();
          resolve({
            logoWidth: logoRect.width,
            logoHeight: logoRect.height,
            compactOverlap: intersects(compactVisitorRect, compactBackRect),
            expandedOverlap: intersects(expandedVisitorRect, expandedBackRect),
            documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
            viewportWidth: document.documentElement.clientWidth,
          });
        }, 520);
      }, 180);
    }
    else if (Date.now() >= deadline) {
      clearInterval(timer);
      resolve({ state: 'timeout' });
    }
  }, 80);
})`

const mobileIntroTypographyAuditExpression = `new Promise((resolve) => {
  const deadline = Date.now() + 8000;
  const timer = setInterval(() => {
    const title = document.querySelector('.lnl-intro-copy > strong');
    if (title) {
      clearInterval(timer);
      const rect = title.getBoundingClientRect();
      resolve({
        text: title.textContent?.trim() || '',
        left: rect.left,
        right: rect.right,
        scrollWidth: title.scrollWidth,
        clientWidth: title.clientWidth,
        viewportWidth: document.documentElement.clientWidth,
      });
    }
    else if (Date.now() >= deadline) {
      clearInterval(timer);
      resolve({ state: 'timeout' });
    }
  }, 60);
})`

const mobileProbeMatrixAuditExpression = `new Promise((resolve) => {
  const deadline = Date.now() + 12000;
  const timer = setInterval(() => {
    const button = document.querySelector('[role="button"][aria-label^="Tokyo Fixture"]');
    if (button) {
      clearInterval(timer);
      button.click();
      const listTimer = setInterval(() => {
        const list = document.querySelector('.lnl-ping-probe-list');
        const cards = [...document.querySelectorAll('.lnl-ping-probe')];
        const listRect = list?.getBoundingClientRect();
        if (list && listRect && cards.length === 3) {
          clearInterval(listTimer);
          resolve({
            count: cards.length,
            clientWidth: list.clientWidth,
            scrollWidth: list.scrollWidth,
            rows: new Set(cards.map(card => Math.round(card.getBoundingClientRect().top))).size,
            contained: cards.every((card) => {
              const rect = card.getBoundingClientRect();
              return rect.left >= listRect.left - 0.5 && rect.right <= listRect.right + 0.5;
            }),
          });
        }
        else if (Date.now() >= deadline) {
          clearInterval(listTimer);
          resolve({ count: cards.length, state: 'timeout' });
        }
      }, 80);
    }
    else if (Date.now() >= deadline) {
      clearInterval(timer);
      resolve({ count: 0, state: 'button-timeout' });
    }
  }, 100);
})`

const visitorCollapseAuditExpression = `new Promise((resolve) => {
  const deadline = performance.now() + 16000;
  const frameDeltas = [];
  const widths = [];
  const heights = [];
  const heightSamples = [];
  const longTasks = [];
  let previousFrame = performance.now();
  let observingCollapse = false;
  let compactingSeen = false;
  let observer;
  if ('PerformanceObserver' in window) {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        if (observingCollapse)
          longTasks.push(entry.duration);
    });
    try { observer.observe({ type: 'longtask' }); } catch {}
  }

  const finish = (state) => {
    observer?.disconnect();
    resolve({
      state,
      compactingSeen,
      frames: frameDeltas.length,
      maxFrame: frameDeltas.length ? Math.max(...frameDeltas) : 0,
      maxLongTask: longTasks.length ? Math.max(...longTasks) : 0,
      maxWidthStep: widths.length > 1 ? Math.max(...widths.slice(1).map((value, index) => Math.abs(value - widths[index]))) : 0,
      maxHeightStep: heights.length > 1 ? Math.max(...heights.slice(1).map((value, index) => Math.abs(value - heights[index]))) : 0,
      maxHeightVelocity: heightSamples.length > 1
        ? Math.max(...heightSamples.slice(1).map((sample, index) => {
            const previous = heightSamples[index];
            return Math.abs(sample.height - previous.height) / Math.max(sample.time - previous.time, 1);
          }))
        : 0,
      largestHeightChanges: heightSamples.slice(1).map((sample, index) => ({
        from: heightSamples[index],
        to: sample,
        delta: Math.abs(sample.height - heightSamples[index].height),
      })).sort((a, b) => b.delta - a.delta).slice(0, 4),
    });
  };

  const frame = (now) => {
    const visitor = document.querySelector('.lnl-visitor');
    const state = visitor?.getAttribute('data-presentation-state');
    if (state === 'collapsing' || state === 'compacting') {
      observingCollapse = true;
      compactingSeen ||= state === 'compacting';
    }
    if (observingCollapse) {
      frameDeltas.push(now - previousFrame);
      const rect = visitor?.querySelector('.lnl-visitor-trigger')?.getBoundingClientRect();
      if (rect) {
        widths.push(rect.width);
        heights.push(rect.height);
        heightSamples.push({ state, height: rect.height, time: now });
      }
    }
    previousFrame = now;
    if (observingCollapse && state === 'compact') {
      finish('compact');
      return;
    }
    if (now >= deadline) {
      finish(state || 'timeout');
      return;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
})`

const visitorFixtureInitScript = `(() => {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.includes('api.ip.sb/geoip')) {
      return Promise.resolve(new Response(JSON.stringify({
        ip: '198.51.100.24',
        isp: 'Fixture Network',
        country: 'Test Region',
        country_code: 'US',
        city: 'Observatory',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    return nativeFetch(input, init);
  };
})()`

async function capturePingDialogScreenshot(name, width, height) {
  const result = await runInteractivePage(name, width, height, pingDialogOpenExpression, name, `sessionStorage.setItem('leonetlab:intro:1.2.1', 'seen');`)
  assert.equal(result?.state, 'opened')
  assert.ok(result?.left >= -0.5 && result?.right <= result?.viewportWidth + 0.5, `Ping dialog escaped viewport: ${JSON.stringify(result)}`)
  assert.ok(result?.centerError <= 1, `Ping dialog is not centered: ${JSON.stringify(result)}`)
}

async function auditMobileFinanceOverflow(width) {
  const screenshotName = process.env.SMOKE_SCREENSHOT_DIR && width === 390 ? 'mobile-finance-open' : undefined
  const result = await runInteractivePage(`mobile-finance-audit-${width}`, width, 844, financeOverflowAuditExpression, screenshotName, `sessionStorage.setItem('leonetlab:intro:1.2.1', 'seen');`)
  assert.equal(result?.state, 'opened')
  assert.doesNotMatch(result?.triggerText ?? '', financeDetailsLabelPattern)
  assert.equal(result?.textFits, true, `Finance trigger text escaped its card: ${JSON.stringify(result)}`)
  assert.equal(result?.viewportWidth, width)
  assert.ok(result?.documentWidth <= result?.viewportWidth, `Mobile document overflowed: ${JSON.stringify(result)}`)
  assert.ok(result?.left >= 0 && result?.right <= result?.viewportWidth + 0.5, `Finance panel escaped viewport: ${JSON.stringify(result)}`)
}

function reportBrowserAudit(name, result) {
  console.log(`[browser-audit] ${name}: ${JSON.stringify(result)}`)
}

async function auditPingBarGeometry() {
  const result = await runInteractivePage('node-ping-bar-geometry', 1440, 900, pingBarGeometryAuditExpression)
  reportBrowserAudit('node-ping-bar-geometry', result)
  assert.equal(result?.length, 2, `Expected latency and loss panels: ${JSON.stringify(result)}`)
  for (const panel of result) {
    assert.ok(panel.panelHeight >= 30, `Ping panel collapsed: ${JSON.stringify(panel)}`)
    assert.equal(panel.bars.length, 10)
    assert.ok(panel.bars.every(bar => bar.width >= 2 && bar.height >= 6), `Ping bars have no visible geometry: ${JSON.stringify(panel)}`)
    assert.ok(panel.bars.every(bar => bar.background !== 'rgba(0, 0, 0, 0)' && bar.background !== 'transparent'), `Ping bars are transparent: ${JSON.stringify(panel)}`)
    assert.ok(panel.cardTop !== null && panel.cardBottom !== null)
    assert.ok(panel.bars.every(bar => bar.top >= panel.cardTop - 0.5 && bar.bottom <= panel.cardBottom + 0.5), `Ping bars escaped the visible card: ${JSON.stringify(panel)}`)
  }
}

async function auditConfiguredThemeMode(defaultMode, expectedDark, initScript, expectedOverride = null) {
  defaultThemeModeFixture = defaultMode
  try {
    const expectedAppearance = expectedOverride ? 'dark' : defaultMode
    const expression = themeModeAuditExpression
      .replace('__EXPECTED_APPEARANCE__', expectedAppearance)
      .replace('__EXPECTED_DARK__', String(expectedDark))
    const result = await runInteractivePage(`theme-mode-${defaultMode}-${expectedOverride ?? 'default'}`, 900, 700, expression, undefined, initScript)
    reportBrowserAudit(`theme-mode-${defaultMode}-${expectedOverride ?? 'default'}`, result)
    assert.equal(result?.appearance, expectedAppearance)
    assert.equal(result?.override, expectedOverride)
    assert.equal(result?.dark, expectedDark)
    assert.equal(result?.colorScheme, expectedDark ? 'dark' : 'light')
  }
  finally {
    defaultThemeModeFixture = 'system'
  }
}

async function auditGlobeFlagsAcrossThemeChange() {
  const result = await runInteractivePage(
    'globe-flags-theme-change',
    1100,
    780,
    globeFlagThemeAuditExpression,
    undefined,
    `sessionStorage.setItem('leonetlab:intro:1.2.1', 'seen'); localStorage.setItem('appearance', 'light'); localStorage.setItem('leonetlab:appearance:user-override', '1');`,
  )
  reportBrowserAudit('globe-flags-theme-change', result)
  assert.equal(result?.initialCount, 2, `Expected two globe flag overlays: ${JSON.stringify(result)}`)
  assert.equal(result?.canvasSame, true, `Theme switch recreated the globe canvas: ${JSON.stringify(result)}`)
  assert.equal(result?.minCount, 2, `Globe flags disappeared during theme switch: ${JSON.stringify(result)}`)
  assert.equal(result?.allLoaded, true, `A globe flag asset failed to load: ${JSON.stringify(result)}`)
  assert.equal(result?.allDisplayed, true, `A globe flag was hidden: ${JSON.stringify(result)}`)
  assert.equal(result?.overlayMoved, true, `Globe drag did not change the projected flag position: ${JSON.stringify(result)}`)
  assert.equal(result?.draggingEnded, true, `Globe drag state did not settle: ${JSON.stringify(result)}`)
}

async function auditPingDialogCloseAnimation() {
  const result = await runInteractivePage(
    'ping-dialog-close-animation',
    1100,
    780,
    pingDialogCloseAuditExpression,
    undefined,
    `sessionStorage.setItem('leonetlab:intro:1.2.1', 'seen');`,
  )
  reportBrowserAudit('ping-dialog-close-animation', result)
  assert.equal(result?.closedSeen, true, `Ping dialog skipped its closed state: ${JSON.stringify(result)}`)
  assert.ok(result?.closedFrames >= 2, `Ping dialog exit animation had too few frames: ${JSON.stringify(result)}`)
}

async function auditIntroGlobeHandoff() {
  const result = await runInteractivePage('intro-globe-handoff', 1100, 780, introHandoffAuditExpression)
  reportBrowserAudit('intro-globe-handoff', result)
  assert.equal(result?.handoffReady, true, `Intro globe did not prepare a dashboard handoff: ${JSON.stringify(result)}`)
  assert.equal(result?.staged, true, `Dashboard content was not staged behind the intro: ${JSON.stringify(result)}`)
  assert.ok(result?.xError < 1 && result?.yError < 1 && result?.scaleError < 0.01, `Intro handoff geometry did not match the dashboard globe: ${JSON.stringify(result)}`)
}

async function auditMobileProbeMatrix() {
  const result = await runInteractivePage('mobile-probe-matrix', 390, 844, mobileProbeMatrixAuditExpression)
  reportBrowserAudit('mobile-probe-matrix', result)
  assert.equal(result?.count, 3, `Expected three mobile probes: ${JSON.stringify(result)}`)
  assert.ok(result?.scrollWidth <= result?.clientWidth + 1, `Mobile probes still require horizontal scrolling: ${JSON.stringify(result)}`)
  assert.equal(result?.rows, 1, `Three probes should fit in one mobile row: ${JSON.stringify(result)}`)
  assert.equal(result?.contained, true, `Mobile probe cards escaped their matrix: ${JSON.stringify(result)}`)
}

async function auditVisitorCollapse() {
  visitorInfoEnabledFixture = true
  try {
    const result = await runInteractivePage('visitor-collapse', 900, 700, visitorCollapseAuditExpression, undefined, visitorFixtureInitScript)
    reportBrowserAudit('visitor-collapse', result)
    assert.equal(result?.state, 'compact', `Visitor presentation did not finish: ${JSON.stringify(result)}`)
    assert.equal(result?.compactingSeen, true, `Visitor compacting phase was skipped: ${JSON.stringify(result)}`)
    assert.ok(result?.frames >= 20, `Visitor collapse produced too few animation frames: ${JSON.stringify(result)}`)
    assert.ok(result?.maxFrame < 160, `Visitor collapse stalled for too long: ${JSON.stringify(result)}`)
    assert.ok(result?.maxLongTask < 160, `Visitor collapse produced a long main-thread task: ${JSON.stringify(result)}`)
    // Normalize by elapsed time so a healthy 30 fps CI runner is not judged by
    // the smaller per-frame distance observed at 60 fps. An actual snap remains
    // several times faster than the CSS transition and still fails this bound.
    assert.ok(result?.maxHeightVelocity < 2.5, `Visitor collapse height changed too abruptly: ${JSON.stringify(result)}`)
  }
  finally {
    visitorInfoEnabledFixture = false
  }
}

async function auditMobileChromeLayout() {
  visitorInfoEnabledFixture = true
  try {
    const initScript = `${visitorFixtureInitScript}\nsessionStorage.setItem('leonetlab:intro:1.2.1', 'seen');`
    const result = await runInteractivePage('mobile-chrome-layout', 390, 844, mobileChromeLayoutAuditExpression, undefined, initScript)
    reportBrowserAudit('mobile-chrome-layout', result)
    assert.ok(Math.abs(result?.logoWidth - result?.logoHeight) < 0.5, `Mobile logo frame is not square: ${JSON.stringify(result)}`)
    assert.equal(result?.compactOverlap, false, `Compact visitor card overlaps back-to-top: ${JSON.stringify(result)}`)
    assert.equal(result?.expandedOverlap, false, `Expanded visitor card overlaps back-to-top: ${JSON.stringify(result)}`)
    assert.ok(result?.documentWidth <= result?.viewportWidth, `Mobile chrome overflowed horizontally: ${JSON.stringify(result)}`)
  }
  finally {
    visitorInfoEnabledFixture = false
  }
}

async function auditMobileIntroTypography() {
  const result = await runInteractivePage('mobile-intro-typography', 390, 844, mobileIntroTypographyAuditExpression)
  reportBrowserAudit('mobile-intro-typography', result)
  assert.ok(result?.left >= -0.5 && result?.right <= result?.viewportWidth + 0.5, `Mobile intro title escaped viewport: ${JSON.stringify(result)}`)
  assert.ok(result?.scrollWidth <= result?.clientWidth + 1, `Mobile intro title overflowed its column: ${JSON.stringify(result)}`)
}

try {
  const html = await dumpDom('home', '/')

  assert.match(html, /Tokyo Fixture/)
  assert.match(html, /Frankfurt Fixture/)
  assert.match(html, /55 ms/)
  assert.match(html, /4\.2%/)
  assert.match(html, /bg-emerald-600\/90/)
  assert.match(html, /bg-rose-500\/80/)
  assert.doesNotMatch(html, /暂无节点/)
  assert.ok(rpcCalls.some(call => call.method === 'common:getRecords' && call.params?.type === 'ping' && call.params?.hours === 1 && !call.params?.uuid))
  if (process.env.SMOKE_SCREENSHOT_DIR)
    mkdirSync(process.env.SMOKE_SCREENSHOT_DIR, { recursive: true })
  await auditMobileFinanceOverflow(320)
  await auditMobileFinanceOverflow(390)
  await auditPingBarGeometry()
  await auditConfiguredThemeMode('light', false)
  await auditConfiguredThemeMode('dark', true)
  await auditConfiguredThemeMode(
    'light',
    true,
    `localStorage.setItem('appearance', 'dark'); localStorage.setItem('leonetlab:appearance:user-override', '1');`,
    '1',
  )
  await auditGlobeFlagsAcrossThemeChange()
  await auditPingDialogCloseAnimation()
  await auditIntroGlobeHandoff()
  await auditMobileProbeMatrix()
  await auditVisitorCollapse()
  await auditMobileChromeLayout()
  await auditMobileIntroTypography()

  const detailHtml = await dumpDom('detail', `/instance/${nodeUuid}`, 8000)
  assert.match(detailHtml, /资源与系统记录/)
  assert.match(detailHtml, /网络质量记录/)
  assert.match(detailHtml, /Tokyo route probe/)
  assert.ok(rpcCalls.some(call => call.method === 'common:getRecords' && call.params?.type === 'ping' && call.params?.uuid === nodeUuid))
  assert.ok(rpcCalls.some(call => call.method === 'public:queryMetrics'))

  console.log('Komari 1.2.5 rendered-node and history-fallback integration smoke test passed.')

  if (process.env.SMOKE_SCREENSHOT_DIR) {
    await captureScreenshot('desktop-home', 1920, 1080, '/', 6000)
    await captureScreenshot('desktop-earth-late', 1920, 1080, '/', 12000)
    await captureScreenshot('desktop-dark', 1920, 1080, '/', 6000, ['--force-dark-mode'])
    await capturePingDialogScreenshot('desktop-ping-dialog', 1440, 900)
    await capturePingDialogScreenshot('mobile-ping-dialog', 390, 844)
    await captureScreenshot('desktop-detail', 1600, 1000, `/instance/${nodeUuid}`, 6000)
    await captureScreenshot('mobile-intro', 390, 844, '/', 900)
    await captureScreenshot('mobile-home', 390, 844, '/', 6000)
    console.log(`Visual audit screenshots saved to ${process.env.SMOKE_SCREENSHOT_DIR}`)
  }
}
catch (error) {
  if (process.env.GITHUB_STEP_SUMMARY) {
    const details = error instanceof Error ? (error.stack || error.message) : String(error)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Komari browser smoke failure\n\n\`\`\`text\n${details.slice(0, 8000)}\n\`\`\`\n`)
  }
  throw error
}
finally {
  await new Promise(resolveClose => server.close(resolveClose))
  rmSync(profile, { recursive: true, force: true })
}
