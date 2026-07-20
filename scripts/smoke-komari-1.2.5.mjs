import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, resolve, sep } from 'node:path'
import process from 'node:process'

const root = resolve(import.meta.dirname, '..')
const dist = resolve(root, 'dist')
const visualAuditEnabled = Boolean(process.env.SMOKE_SCREENSHOT_DIR)
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
const rpcCalls = []
const leadingSlashesPattern = /^\/+/
const lineBreakPattern = /\r?\n/

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
          earthViewMode: visualAuditEnabled ? 'earth' : 'hide',
          visitorInfoCardEnabled: false,
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
        result = rpcRequest.params?.type === 'ping'
          ? { count: pingRecords.length, records: pingRecords, tasks: pingTasks }
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

async function capturePingDialogScreenshot(name, width, height) {
  const screenshotProfile = `${profile}-${name}`
  const screenshotDir = process.env.SMOKE_SCREENSHOT_DIR
  assert.ok(screenshotDir)

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
    `http://127.0.0.1:${address.port}/`,
  ], { windowsHide: true })

  let socket
  try {
    const activePortFile = resolve(screenshotProfile, 'DevToolsActivePort')
    const deadline = Date.now() + 10_000
    while (!existsSync(activePortFile) && Date.now() < deadline)
      await new Promise(resolveWait => setTimeout(resolveWait, 50))
    assert.ok(existsSync(activePortFile), 'Chrome DevTools port was not created')

    const [port] = readFileSync(activePortFile, 'utf8').trim().split(lineBreakPattern)
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
    const opened = await command('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `new Promise((resolve) => {
        const deadline = Date.now() + 12000;
        const timer = setInterval(() => {
          const button = [...document.querySelectorAll('[role="button"]')]
            .find((element) => element.getAttribute('aria-label')?.includes('Tokyo Fixture 延迟'));
          if (button) {
            clearInterval(timer);
            button.click();
            const dialogDeadline = Date.now() + 5000;
            const dialogTimer = setInterval(() => {
              if (document.querySelector('.lnl-ping-workspace')) {
                clearInterval(dialogTimer);
                resolve('opened');
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
      })`,
    })
    assert.equal(opened.result?.value, 'opened')
    await new Promise(resolveWait => setTimeout(resolveWait, 900))

    const screenshot = await command('Page.captureScreenshot', { format: 'png', fromSurface: true })
    writeFileSync(resolve(screenshotDir, `${name}.png`), Buffer.from(screenshot.data, 'base64'))
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

  const detailHtml = await dumpDom('detail', `/instance/${nodeUuid}`, 8000)
  assert.match(detailHtml, /资源与系统记录/)
  assert.match(detailHtml, /网络质量记录/)
  assert.match(detailHtml, /Tokyo route probe/)
  assert.ok(rpcCalls.some(call => call.method === 'common:getRecords' && call.params?.type === 'ping' && call.params?.uuid === nodeUuid))
  assert.ok(rpcCalls.some(call => call.method === 'public:queryMetrics'))

  console.log('Komari 1.2.5 rendered-node and history-fallback integration smoke test passed.')

  if (process.env.SMOKE_SCREENSHOT_DIR) {
    mkdirSync(process.env.SMOKE_SCREENSHOT_DIR, { recursive: true })
    await captureScreenshot('desktop-home', 1920, 1080, '/', 6000)
    await captureScreenshot('desktop-earth-late', 1920, 1080, '/', 12000)
    await captureScreenshot('desktop-dark', 1920, 1080, '/', 6000, ['--force-dark-mode'])
    await capturePingDialogScreenshot('desktop-ping-dialog', 1440, 900)
    await captureScreenshot('desktop-detail', 1600, 1000, `/instance/${nodeUuid}`, 6000)
    await captureScreenshot('mobile-intro', 390, 844, '/', 900)
    await captureScreenshot('mobile-home', 390, 844, '/', 6000)
    console.log(`Visual audit screenshots saved to ${process.env.SMOKE_SCREENSHOT_DIR}`)
  }
}
finally {
  await new Promise(resolveClose => server.close(resolveClose))
  rmSync(profile, { recursive: true, force: true })
}
