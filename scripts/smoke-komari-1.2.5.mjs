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
const komariVersionArgument = process.argv.find(argument => argument.startsWith('--komari-version='))
const fixtureKomariVersion = komariVersionArgument?.split('=', 2)[1] || '1.2.5-fix1'
const externalFixtureDriver = process.env.SMOKE_EXTERNAL_DRIVER === '1'
const usesModernKomariFixture = ['1.3.2', '1.4.2', '1.4.3'].includes(fixtureKomariVersion)
const usesKomari14xFixture = ['1.4.2', '1.4.3'].includes(fixtureKomariVersion)
const visualAuditEnabled = Boolean(process.env.SMOKE_SCREENSHOT_DIR)
const financeDetailsLabelPattern = /查看财务汇率详情/
const visitorResolvedInfoPattern = /Fixture Network|Test Region|Observatory/
const pingSectionInPattern = /ping-section-in/
const pingChartInPattern = /ping-chart-in/
const ewmaPattern = /EWMA/
const regionCpuPattern = /CPU 总体负载/
const regionThroughputPattern = /LIVE THROUGHPUT/
const freeFinancePattern = /免费/
const fixedFinanceLabelPattern = /^费用/
const missingFinancePattern = /未填写/
const introSyncingPattern = /SYNCHRONIZING/
const introReadyNodesPattern = /4 ONLINE · 4 NODES/
// 共享 CI runner CPU 受限，WebGL 软件渲染初始化与 ECharts 懒加载块解析可叠加
// 出超过 1s 的单个 longtask（CI 实测 1412ms），并非交接逻辑卡死；帧级停滞仍
// 由各审计的 maxFrame 断言兜底。本地保留 400ms 硬阈值用于诊断真实主线程卡死。
const longTaskHardLimitMs = process.env.CI ? 2500 : 400
// 同理，CI 软件渲染下 intro 交接的单帧间隔实测可达 166ms，超过本地 160ms
// 硬阈值但并非真实停滞；帧推进、瞬移与落点精度仍由 frames/maxDistanceJump/
// landError 等断言兜底。本地保留 160ms 硬阈值用于诊断真实动画掉帧。
const introHandoffFrameGapLimitMs = process.env.CI ? 400 : 160
const nodeUuid = 'fixture-node-a'
const secondNodeUuid = 'fixture-node-b'
const thirdNodeUuid = 'fixture-node-c'
const fourthNodeUuid = 'fixture-node-d'
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
  client(thirdNodeUuid, 'Singapore Edge', 'SG', 8),
  client(fourthNodeUuid, 'Los Angeles Edge', 'US', 6),
]
clients[0].price = 119
clients[0].billing_cycle = 365
clients[0].currency = 'USD'
clients[0].gpu_name = 'Fixture GPU'
clients[0].expired_at = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
clients[1].price = -1
clients[2].price = 24
clients[3].price = 45
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
  [thirdNodeUuid]: status(thirdNodeUuid, 12),
  [fourthNodeUuid]: status(fourthNodeUuid, 31),
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
const metricSeries = dialogPingTasks.flatMap(task => [
  {
    metric_key: 'ping.latency_ms',
    tags: usesKomari14xFixture ? undefined : { task_id: String(task.id) },
    interval_seconds: usesKomari14xFixture ? task.interval : undefined,
    points: dialogPingRecords
      .filter(record => record.task_id === task.id)
      .map(record => ({
        time: record.time,
        value: record.value < 0 ? null : record.value,
        labels: usesKomari14xFixture ? { task_id: String(task.id) } : undefined,
      })),
  },
  {
    metric_key: 'ping.loss',
    tags: usesKomari14xFixture ? undefined : { task_id: String(task.id) },
    interval_seconds: usesKomari14xFixture ? task.interval : undefined,
    points: dialogPingRecords
      .filter(record => record.task_id === task.id)
      .map(record => ({
        time: record.time,
        value: record.value < 0 ? 1 : 0,
        labels: usesKomari14xFixture ? { task_id: String(task.id) } : undefined,
      })),
  },
])
const metricTaskStats = dialogPingTasks.map(task => ({
  task_id: String(task.id),
  name: task.name,
  type: task.type,
  interval: task.interval,
  loss: usesKomari14xFixture ? task.loss : task.loss / 100,
  loss_approximate: usesKomari14xFixture && task.id === 2,
  min: task.min,
  max: task.max,
  avg: task.avg,
  latest: task.latest,
  total: task.total,
  p99_p50_ratio: task.p99_p50_ratio,
}))
const rpcCalls = []
let defaultThemeModeFixture = 'system'
let earthViewModeFixture = 'earth'
let visitorInfoEnabledFixture = false
let introAnimationEnabledFixture = true
let metricStoreUninitializedFixture = false
let nodeResponseDelayMsFixture = 0
let publicSettingsDelayMsFixture = 0
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
    const sendPublicSettings = () => json(response, {
      status: 'success',
      message: '',
      data: {
        sitename: 'Komari Observatory',
        description: visualAuditEnabled ? 'Precision global network telemetry' : 'Live global node telemetry',
        private_site: false,
        record_enabled: true,
        theme: 'LeoNetLab',
        theme_settings: {
          brandLogoUrl: visualAuditEnabled ? '/images/logo/leonetlab.png' : '',
          rpcTransportMode: 'http',
          defaultThemeMode: defaultThemeModeFixture,
          introAnimationEnabled: introAnimationEnabledFixture,
          earthViewMode: earthViewModeFixture,
          extendedTelemetryEnabled: true,
          extendedTelemetryConnectionsEnabled: true,
          extendedTelemetryProcessEnabled: true,
          extendedTelemetryGpuUsageEnabled: true,
          extendedTelemetryGpuMemoryEnabled: true,
          extendedTelemetryGpuTemperatureEnabled: true,
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
    if (publicSettingsDelayMsFixture > 0)
      setTimeout(sendPublicSettings, publicSettingsDelayMsFixture)
    else
      sendPublicSettings()
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
        'rpc.version': fixtureKomariVersion,
        'common:getVersion': { version: fixtureKomariVersion },
        // 1.2.5-fix1 returns Client[]; current Komari returns a UUID-keyed object.
        'common:getNodes': usesModernKomariFixture
          ? Object.fromEntries(clients.map(item => [item.uuid, item]))
          : clients,
        'public:getNodesInformation': usesKomari14xFixture
          ? Object.fromEntries(clients.map(item => [item.uuid, { ...item, ipv4: '', ipv6: '', remark: '', version: '' }]))
          : undefined,
        'common:getNodesLatestStatus': statuses,
        'common:getNodeRecentStatus': { count: historyRecords.length, records: historyRecords },
        'public:listMetricDefinitions': usesKomari14xFixture
          ? [
              { name: 'gpu.usage', description: 'GPU utilization', type: 'gauge', unit: '%', retention_days: 30 },
              { name: 'gpu.device.usage', description: 'Per-device GPU utilization', type: 'gauge', unit: '%', retention_days: 30 },
              { name: 'gpu.memory.used', description: 'GPU memory used', type: 'gauge', unit: 'bytes', retention_days: 30 },
              { name: 'gpu.memory.total', description: 'GPU memory total', type: 'gauge', unit: 'bytes', retention_days: 30 },
              { name: 'gpu.temperature', description: 'GPU temperature', type: 'gauge', unit: '°C', retention_days: 30 },
            ]
          : undefined,
        'public:queryMetrics': usesModernKomariFixture
          ? { interval_seconds: usesKomari14xFixture ? 60 : undefined, series: metricSeries }
          : undefined,
        'public:getPingMetricStats': usesModernKomariFixture
          ? { interval_seconds: usesKomari14xFixture ? 60 : undefined, stats: metricTaskStats }
          : undefined,
        'public:getPublicPingTasks': usesModernKomariFixture
          ? dialogPingTasks.map((task, index) => ({ id: task.id, weight: index + 1 }))
          : undefined,
      }
      let result = results[rpcRequest.method]
      const requestedGpuMetrics = Array.isArray(rpcRequest.params?.metric_keys)
        ? rpcRequest.params.metric_keys.filter(metricKey => metricKey.startsWith('gpu.'))
        : []
      if (rpcRequest.method === 'public:queryMetrics' && requestedGpuMetrics.length > 0) {
        const metricValues = {
          'gpu.usage': index => 18 + (index % 12),
          'gpu.device.usage': index => 22 + (index % 18),
          'gpu.memory.used': index => 2_147_483_648 + index * 8_388_608,
          'gpu.memory.total': () => 8_589_934_592,
          'gpu.temperature': index => 48 + (index % 7),
        }
        const series = requestedGpuMetrics.flatMap((metricKey) => {
          const valueAt = metricValues[metricKey]
          if (!valueAt)
            return []
          return [{
            metric_key: metricKey,
            entity_id: nodeUuid,
            unit: metricKey.includes('memory') ? 'bytes' : metricKey === 'gpu.temperature' ? '°C' : '%',
            tags: { device_index: '0', device_name: 'Fixture GPU' },
            count: historyRecords.length,
            points: historyRecords.map((record, index) => ({ time: record.time, value: valueAt(index) })),
          }]
        })
        result = {
          start: historyRecords[0].time,
          end: historyRecords.at(-1).time,
          count: series.length,
          series,
        }
      }
      // 官方 metric store 未初始化时 public:queryMetrics 返回 InternalError(-32603)。
      if (rpcRequest.method === 'public:queryMetrics' && metricStoreUninitializedFixture) {
        json(response, {
          jsonrpc: '2.0',
          id: rpcRequest.id,
          error: { code: -32603, message: 'Internal error: metric store not initialized' },
        })
        return
      }
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
      const sendResult = () => {
        if (!response.writableEnded)
          json(response, { jsonrpc: '2.0', id: rpcRequest.id, result })
      }
      const shouldDelayNodeResponse = nodeResponseDelayMsFixture > 0
        && (rpcRequest.method === 'common:getNodes' || rpcRequest.method === 'common:getNodesLatestStatus')
      if (shouldDelayNodeResponse)
        setTimeout(sendResult, nodeResponseDelayMsFixture)
      else
        sendResult()
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
assert.ok(browser || externalFixtureDriver, 'Chrome or Edge is required for the integration smoke test')

const requestedFixturePort = Number.parseInt(process.env.SMOKE_FIXTURE_PORT || '0', 10)
assert.ok(Number.isInteger(requestedFixturePort) && requestedFixturePort >= 0 && requestedFixturePort <= 65_535)
await new Promise((resolveListen, rejectListen) => {
  server.once('error', rejectListen)
  server.listen(requestedFixturePort, '127.0.0.1', resolveListen)
})

const address = server.address()
assert.ok(address && typeof address === 'object')
console.log(`[fixture] http://127.0.0.1:${address.port}`)
const profile = resolve(tmpdir(), `leonetlab-komari-smoke-${process.pid}`)

async function dumpDom(name, path, virtualTimeBudget = 7500) {
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
    const button = document.querySelector('button[aria-label*="查看 Tokyo Fixture Ping 详情"]');
    if (button) {
      clearInterval(timer);
      button.click();
      // 等待 .lnl-ping-probes 出现再判定打开：它只在数据加载完成后渲染，
      // 这样依赖回退请求完成的审计（如 metric-store-fallback）不会与
      // 仍在进行中的 queryMetrics -> getRecords 链竞争。
      const dialogDeadline = Date.now() + 10000;
      const dialogTimer = setInterval(() => {
        const chart = document.querySelector('.lnl-ping-chart .echarts');
        const chartRect = chart?.getBoundingClientRect();
        const dialog = document.querySelector('.lnl-ping-dialog[data-state="open"]');
        const dialogRect = dialog?.getBoundingClientRect();
        if (document.querySelector('.lnl-ping-workspace') && document.querySelector('.lnl-ping-probes') && dialogRect && chartRect?.width > 100 && chartRect?.height > 200) {
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
    const button = document.querySelector('.node-card .lnl-billing-trigger:not(.is-static)');
    if (button) {
      clearInterval(timer);
      button.click();
      setTimeout(() => {
        const popover = document.querySelector('.lnl-billing-menu');
        const rect = popover?.getBoundingClientRect();
        const viewportWidth = document.documentElement.clientWidth;
        const triggerRect = button.getBoundingClientRect();
        const financeCellRect = button.closest('[data-finance-state]')?.getBoundingClientRect();
        const chevronRect = button.querySelector('.lnl-billing-chevron')?.getBoundingClientRect();
        const assistiveHint = button.querySelector('.sr-only');
        const visibleCopy = button.cloneNode(true);
        visibleCopy.querySelectorAll('.sr-only').forEach(node => node.remove());
        resolve({
          state: popover ? 'opened' : 'closed',
          triggerText: visibleCopy.textContent?.replace(/\s+/g, ' ').trim() || '',
          assistiveHintHidden: !assistiveHint || (getComputedStyle(assistiveHint).position === 'absolute' && assistiveHint.getBoundingClientRect().width <= 1),
          textFits: [...button.querySelectorAll('span:not(.sr-only)')].every((span) => {
            const spanRect = span.getBoundingClientRect();
            const buttonRect = button.getBoundingClientRect();
            return spanRect.bottom <= buttonRect.bottom + 0.5 && spanRect.right <= buttonRect.right + 0.5;
          }),
          viewportWidth,
          documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
          left: rect?.left ?? -1,
          right: rect?.right ?? -1,
          triggerFillsCell: Boolean(financeCellRect
            && triggerRect.width >= financeCellRect.width * 0.75
            && triggerRect.left >= financeCellRect.left - 0.5
            && triggerRect.right <= financeCellRect.right + 0.5),
          triggerCellRightInset: financeCellRect ? financeCellRect.right - triggerRect.right : -1,
          chevronRightInset: chevronRect ? triggerRect.right - chevronRect.right : -1,
        });
      }, 420);
    }
    else if (Date.now() >= deadline) {
      clearInterval(timer);
      resolve({ state: 'button-timeout' });
    }
  }, 100);
})`

const nodeFinanceStateAuditExpression = `new Promise((resolve) => {
  const deadline = Date.now() + 12000;
  const timer = setInterval(() => {
    const cells = [...document.querySelectorAll('[data-finance-state]')];
    if (cells.length >= 2) {
      clearInterval(timer);
      resolve({
        viewportWidth: document.documentElement.clientWidth,
        documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        states: cells.map((cell) => {
          const rect = cell.getBoundingClientRect();
          const cardRect = cell.closest('.node-card')?.getBoundingClientRect();
          return {
            state: cell.getAttribute('data-finance-state'),
            text: cell.textContent?.replace(/\\s+/g, ' ').trim() || '',
            insideCard: Boolean(cardRect && rect.left >= cardRect.left - 0.5 && rect.right <= cardRect.right + 0.5 && rect.bottom <= cardRect.bottom + 0.5),
          };
        }),
      });
    }
    if (Date.now() >= deadline) {
      clearInterval(timer);
      resolve({ state: 'timeout', count: cells.length });
    }
  }, 80);
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
    const themeButton = document.querySelector('[data-action="toggleAppearance"]');
    const flagImagesReady = overlays.length === 4
      && overlays.every(overlay => {
        const image = overlay.querySelector('img');
        return image?.complete && image.naturalWidth > 0;
      });
    if (canvas && globeContainer && flagImagesReady && themeButton) {
      clearInterval(timer);
      const initialCanvas = canvas;
      const initialCount = overlays.length;
      const markerFlagRect = overlays[0].querySelector('.lnl-earth-flag')?.getBoundingClientRect();
      const markerCountRect = overlays[0].querySelector('.lnl-earth-count')?.getBoundingClientRect();
      const markerOverlap = Boolean(markerFlagRect && markerCountRect
        && markerFlagRect.left < markerCountRect.right
        && markerFlagRect.right > markerCountRect.left
        && markerFlagRect.top < markerCountRect.bottom
        && markerFlagRect.bottom > markerCountRect.top);
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
      requestAnimationFrame(() => document.querySelector('[data-theme-mode="dark"]')?.click());
      const start = performance.now();
      const capture = () => {
        samples.push(sample());
        if (performance.now() - start < 950) {
          requestAnimationFrame(capture);
          return;
        }
        const overlayTransformBeforeDrag = document.querySelector('.node-earth-globe:not(.is-intro) .lnl-earth-overlay')?.style.transform || '';
        const rect = canvas.getBoundingClientRect();
        const frontOverlay = [...document.querySelectorAll('.node-earth-globe:not(.is-intro) .lnl-earth-overlay')]
          .find(overlay => getComputedStyle(overlay).pointerEvents !== 'none');
        const flagImage = frontOverlay?.querySelector('.lnl-earth-flag img');
        const flagRect = flagImage?.getBoundingClientRect();
        const nativeFlagDragPrevented = flagImage
          ? !flagImage.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true }))
          : false;
        const flagTransformBeforeDrag = frontOverlay?.style.transform || '';
        if (flagImage && flagRect) {
          flagImage.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 6, pointerType: 'mouse', buttons: 1, button: 0, clientX: flagRect.left + flagRect.width / 2, clientY: flagRect.top + flagRect.height / 2 }));
          globeContainer.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 6, pointerType: 'mouse', buttons: 1, clientX: flagRect.left + flagRect.width / 2 + 80, clientY: flagRect.top + flagRect.height / 2 + 8 }));
          globeContainer.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 6, pointerType: 'mouse', button: 0, clientX: flagRect.left + flagRect.width / 2 + 80, clientY: flagRect.top + flagRect.height / 2 + 8 }));
        }
        const flagTransformAfterDrag = frontOverlay?.style.transform || '';
        globeContainer.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, clientX: rect.left + rect.width * 0.5, clientY: rect.top + rect.height * 0.5 }));
        const draggingStarted = globeContainer.classList.contains('is-dragging');
        globeContainer.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 7, clientX: rect.left + rect.width * 0.7, clientY: rect.top + rect.height * 0.52 }));
        const overlayTransformAfterMove = document.querySelector('.node-earth-globe:not(.is-intro) .lnl-earth-overlay')?.style.transform || '';
        globeContainer.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7, clientX: rect.left + rect.width * 0.7, clientY: rect.top + rect.height * 0.52 }));
        setTimeout(() => {
          const interactiveOverlay = [...document.querySelectorAll('.node-earth-globe:not(.is-intro) .lnl-earth-overlay')]
            .find(overlay => getComputedStyle(overlay).pointerEvents !== 'none');
          // Headless Linux does not always advertise a fine hover pointer. Use the
          // product's shared click/touch path here; hover intent is covered by the
          // dedicated region-interaction audit with an explicit desktop fixture.
          interactiveOverlay?.click();
          setTimeout(() => {
            const readout = interactiveOverlay?.querySelector('.lnl-earth-readout');
            const activeFlag = interactiveOverlay?.querySelector('.lnl-earth-flag');
            const siblingZIndexes = [...document.querySelectorAll('.node-earth-globe:not(.is-intro) .lnl-earth-overlay:not(.is-active)')]
              .map(overlay => Number.parseInt(getComputedStyle(overlay).zIndex || '0', 10));
            resolve({
              initialCount,
              markerOverlap,
              canvasSame: initialCanvas === document.querySelector('.node-earth-globe:not(.is-intro) canvas'),
              minCount: Math.min(...samples.map(item => item.count)),
              allLoaded: samples.every(item => item.loaded),
              allDisplayed: samples.every(item => item.displayed),
              flagsNotDraggable: [...document.querySelectorAll('.node-earth-globe:not(.is-intro) .lnl-earth-flag img')].every(image => image.draggable === false),
              nativeFlagDragPrevented,
              flagDragMoved: Boolean(flagTransformBeforeDrag && flagTransformBeforeDrag !== flagTransformAfterDrag),
              draggingStarted,
              transformBefore: overlayTransformBeforeDrag,
              transformAfterMove: overlayTransformAfterMove,
              overlayMoved: overlayTransformBeforeDrag !== (document.querySelector('.node-earth-globe:not(.is-intro) .lnl-earth-overlay')?.style.transform || ''),
              draggingEnded: !document.querySelector('.node-earth-globe:not(.is-intro)')?.classList.contains('is-dragging'),
              regionReadout: readout?.textContent?.replace(/\\s+/g, ' ').trim() || '',
              activeOverlayZ: Number.parseInt(getComputedStyle(interactiveOverlay).zIndex || '0', 10),
              maxSiblingZ: Math.max(0, ...siblingZIndexes),
              activeFlagOpacity: Number.parseFloat(getComputedStyle(activeFlag).opacity || '1'),
            });
          }, 180);
        }, 120);
      };
      requestAnimationFrame(capture);
    }
    else if (Date.now() >= deadline) {
      clearInterval(timer);
      resolve({ state: 'timeout', overlays: overlays.length });
    }
  }, 80);
})`

const globeRegionInteractionAuditExpression = `new Promise((resolve) => {
  const deadline = Date.now() + 12000;
  const timer = setInterval(() => {
    const overlay = [...document.querySelectorAll('.node-earth-globe:not(.is-intro) .lnl-earth-overlay')]
      .find(item => getComputedStyle(item).pointerEvents !== 'none');
    if (overlay && window.__lnlGlobeProbe?.dashboard) {
      clearInterval(timer);
      overlay.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
      setTimeout(() => {
        const openedTooEarly = overlay.getAttribute('aria-expanded') === 'true';
        setTimeout(() => {
          const hoverOpened = overlay.getAttribute('aria-expanded') === 'true';
          const readout = overlay.querySelector('.lnl-earth-readout');
          const readoutRect = readout?.getBoundingClientRect();
          overlay.click();
          overlay.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
          setTimeout(() => {
            const pinnedSurvivedLeave = overlay.getAttribute('aria-expanded') === 'true';
            const pausedPhiStart = window.__lnlGlobeProbe?.dashboard?.phi ?? null;
            setTimeout(() => {
              const pausedPhiEnd = window.__lnlGlobeProbe?.dashboard?.phi ?? null;
              document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
              setTimeout(() => {
                const resumedPhiEnd = window.__lnlGlobeProbe?.dashboard?.phi ?? null;
                const outsideClosed = overlay.getAttribute('aria-expanded') === 'false';
                const keyboardDeadline = Date.now() + 2200;
                const keyboardTimer = setInterval(() => {
                  const keyboardOverlay = [...document.querySelectorAll('.node-earth-globe:not(.is-intro) .lnl-earth-overlay')]
                    .find(item => getComputedStyle(item).pointerEvents !== 'none');
                  if (!keyboardOverlay && Date.now() < keyboardDeadline)
                    return;
                  clearInterval(keyboardTimer);
                  keyboardOverlay?.blur();
                  keyboardOverlay?.focus({ preventScroll: true });
                  keyboardOverlay?.dispatchEvent(new FocusEvent('focus'));
                  setTimeout(() => {
                    const keyboardOpened = keyboardOverlay?.getAttribute('aria-expanded') === 'true';
                    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
                    requestAnimationFrame(() => resolve({
                      openedTooEarly,
                      hoverOpened,
                      pinnedSurvivedLeave,
                      outsideClosed,
                      pausedDelta: pausedPhiStart !== null && pausedPhiEnd !== null ? Math.abs(pausedPhiEnd - pausedPhiStart) : null,
                      resumedDelta: pausedPhiEnd !== null && resumedPhiEnd !== null ? Math.abs(resumedPhiEnd - pausedPhiEnd) : null,
                      keyboardOpened,
                      escapeClosed: keyboardOverlay?.getAttribute('aria-expanded') === 'false',
                      readoutInsideViewport: Boolean(readoutRect
                        && readoutRect.left >= 0
                        && readoutRect.top >= 0
                        && readoutRect.right <= document.documentElement.clientWidth + 0.5
                        && readoutRect.bottom <= window.innerHeight + 0.5),
                    }));
                  }, 40);
                }, 50);
              }, 360);
            }, 300);
          }, 280);
        }, 100);
      }, 60);
    }
    else if (Date.now() >= deadline) {
      clearInterval(timer);
      resolve({ state: 'timeout' });
    }
  }, 80);
})`

const globeRouteRippleAuditExpression = `new Promise((resolve) => {
  const deadline = Date.now() + 12000;
  const timer = setInterval(() => {
    const trigger = [...document.querySelectorAll('.node-card[role="link"]')]
      .find(card => card.textContent?.includes('Tokyo Fixture'));
    const initialHalo = document.querySelector('#lnl-globe-dashboard-slot .lnl-dashboard-halo');
    if (trigger && initialHalo) {
      clearInterval(timer);
      trigger.click();
      const detailDeadline = Date.now() + 5000;
      const detailTimer = setInterval(() => {
        if (document.querySelector('.lnl-detail')) {
          clearInterval(detailTimer);
          history.back();
          const returnDeadline = Date.now() + 5000;
          const returnTimer = setInterval(() => {
            const nextHalo = document.querySelector('#lnl-globe-dashboard-slot .lnl-dashboard-halo');
            if (nextHalo && nextHalo !== initialHalo && nextHalo.classList.contains('is-route')) {
              clearInterval(returnTimer);
              const durations = nextHalo.getAnimations({ subtree: true })
                .map(animation => Number(animation.effect?.getTiming?.().duration || 0));
              resolve({
                routeRipple: true,
                duration900: durations.includes(900),
                canvasCount: document.querySelectorAll('.node-earth-globe canvas').length,
                path: location.pathname,
              });
            }
            else if (Date.now() >= returnDeadline) {
              clearInterval(returnTimer);
              resolve({ state: 'return-timeout', path: location.pathname });
            }
          }, 60);
        }
        else if (Date.now() >= detailDeadline) {
          clearInterval(detailTimer);
          resolve({ state: 'detail-timeout', path: location.pathname });
        }
      }, 60);
    }
    else if (Date.now() >= deadline) {
      clearInterval(timer);
      resolve({ state: 'home-timeout' });
    }
  }, 80);
})`

const pingDialogCloseAuditExpression = `new Promise((resolve) => {
  const deadline = Date.now() + 12000;
  const timer = setInterval(() => {
    const trigger = document.querySelector('button[aria-label*="查看 Tokyo Fixture Ping 详情"]');
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

// 持久交接层审计：点击 skip 前抓住 fixed stage 内的 canvas 元素引用，
// 飞行全程以该引用采样位置（落地时 Teleport 迁移同一 DOM 节点，引用始终有效），
// 断言距离单调收敛、落点与槽位误差 <2px、canvas 身份不变、自转与拖拽存活。
const introHandoffAuditExpression = `new Promise((resolve) => {
  const deadline = Date.now() + 10000;
  const timer = setInterval(() => {
    const root = document.querySelector('.lnl-intro');
    const slot = document.querySelector('#lnl-globe-dashboard-slot');
    const skip = document.querySelector('.lnl-intro-skip');
    const engine = document.querySelector('#lnl-globe-flight-shell > .node-earth-globe');
    if (root && slot && skip && engine && window.__lnlGlobeProbe?.intro) {
      clearInterval(timer);
      const engineCanvas = engine.querySelector('canvas');
      window.__engineCanvas = engineCanvas;
      const targetRect = slot.getBoundingClientRect();
      const sourceRect = engine.getBoundingClientRect();
      const staged = Boolean(document.querySelector('.lnl-intro-staged'));
      const introMarkerCount = engine.querySelectorAll('.lnl-earth-overlay').length;
      const introPhiBefore = window.__lnlGlobeProbe?.intro?.phi ?? null;
      const frameDeltas = [];
      const longTasks = [];
      let samplingFrames = true;
      let lastFrame = performance.now();
      const frameTick = (now) => {
        frameDeltas.push(now - lastFrame);
        lastFrame = now;
        if (samplingFrames)
          requestAnimationFrame(frameTick);
      };
      requestAnimationFrame(frameTick);
      const longTaskObserver = typeof PerformanceObserver === 'function'
        ? new PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => entry.duration)))
        : null;
      try { longTaskObserver?.observe({ type: 'longtask', buffered: false }); } catch {}
      const distance = (rect) => Math.hypot(rect.left - targetRect.left, rect.top - targetRect.top) + Math.abs(rect.width - targetRect.width);
      const flightSamples = [];
      skip.click();
      // 飞行期间每 ~90ms 采样同一 canvas 引用的矩形；任何一次正向大跳变都是
      // 瞬移回归（v1.2.7 双实例架构的失败模式）。
      const flightTimer = setInterval(() => {
        const rect = engineCanvas.getBoundingClientRect();
        flightSamples.push({
          t: Math.round(performance.now()),
          distance: Math.round(distance(rect) * 100) / 100,
          connected: engineCanvas.isConnected,
          opacity: Number.parseFloat(getComputedStyle(engineCanvas).opacity || '1'),
          visibility: getComputedStyle(engineCanvas).visibility,
          inShell: Boolean(engineCanvas.closest('#lnl-globe-flight-shell')),
          inSlot: Boolean(engineCanvas.closest('#lnl-globe-dashboard-slot')),
          rootMounted: Boolean(document.querySelector('.lnl-intro')),
        });
      }, 90);
      setTimeout(async () => {
        const introPhiAfter = window.__lnlGlobeProbe?.intro?.phi ?? null;
        // 越过 1080ms 飞行 + transitionend 收尾后再验证落点与 canvas 身份。
        await new Promise(done => setTimeout(done, 2400));
        clearInterval(flightTimer);
        samplingFrames = false;
        longTaskObserver?.disconnect();
        const slotCanvas = document.querySelector('#lnl-globe-dashboard-slot canvas');
        const landedRect = engineCanvas.getBoundingClientRect();
         const settledSlotRect = slot.getBoundingClientRect();
         const dashboardHalo = document.querySelector('#lnl-globe-dashboard-slot .lnl-dashboard-halo');
         const dashboardHaloAnimations = dashboardHalo
           ? dashboardHalo.getAnimations({ subtree: true }).map(animation => ({
               name: animation.animationName || '',
               duration: Number(animation.effect?.getTiming?.().duration || 0),
             }))
           : [];
        const probe = window.__lnlGlobeProbe || {};
        const phiAfterSettle = probe.dashboard?.phi ?? null;
        // 单调性：相邻采样距离的最大正向增量。
        let maxDistanceJump = 0;
        for (let index = 1; index < flightSamples.length; index += 1)
          maxDistanceJump = Math.max(maxDistanceJump, flightSamples[index].distance - flightSamples[index - 1].distance);
        const firstShellIndex = flightSamples.findIndex(sample => sample.inShell);
        // 自转继续：dashboard 探针 phi 应持续前进。
        await new Promise(done => setTimeout(done, 420));
        const phiLater = (window.__lnlGlobeProbe || {}).dashboard?.phi ?? null;
        // 拖拽验证：对落入槽位的引擎根派发 pointer 事件，240px 拖动应产生
        // 约 1.2rad 的 phi 变化（远大于同期自转的 ~0.04rad）。
        const dragTarget = engineCanvas.closest('#lnl-globe-dashboard-slot .node-earth-globe') || engine;
        const dragRect = dragTarget.getBoundingClientRect();
        const cx = dragRect.left + dragRect.width / 2;
        const cy = dragRect.top + dragRect.height / 2;
        const phiBeforeDrag = (window.__lnlGlobeProbe || {}).dashboard?.phi ?? null;
        const eventInit = { bubbles: true, cancelable: true, pointerId: 7, isPrimary: true, clientX: cx, clientY: cy };
        dragTarget.dispatchEvent(new PointerEvent('pointerdown', { ...eventInit, buttons: 1, button: 0 }));
        dragTarget.dispatchEvent(new PointerEvent('pointermove', { ...eventInit, buttons: 1, clientX: cx + 240 }));
        dragTarget.dispatchEvent(new PointerEvent('pointerup', { ...eventInit, clientX: cx + 240 }));
        await new Promise(done => setTimeout(done, 240));
        const phiAfterDrag = (window.__lnlGlobeProbe || {}).dashboard?.phi ?? null;
        const shellFlightDistances = flightSamples
          .filter(sample => sample.inShell)
          .map(sample => sample.distance);
        const distinctFlightPositions = new Set(shellFlightDistances.map(value => Math.round(value * 2) / 2)).size;
        const initialDistance = distance(sourceRect);
        resolve({
          staged,
          introMarkerCount,
          // The CI runner can observe the intro immediately after a rendered frame and
          // move the single globe into the flight shell before the next intro-labelled
          // sample. Compare with the component's mount orientation as the stable proof,
          // while retaining the short-window comparison as a secondary signal.
          introRotated: Boolean(
            (probe.intro?.initialPhi !== undefined && Math.abs(probe.intro.phi - probe.intro.initialPhi) > 0.005)
            || (introPhiBefore !== null && introPhiAfter !== null && introPhiBefore !== introPhiAfter)
          ),
          sourceRect: sourceRect.toJSON(),
          targetRect: targetRect.toJSON(),
          initialDistance,
          flightSamples,
          distinctFlightPositions,
          sawIntermediateMotion: shellFlightDistances.some(value => value < initialDistance - 8 && value > 8),
          maxDistanceJump: Math.round(maxDistanceJump * 100) / 100,
          sawFlightShell: firstShellIndex >= 0,
          coverSurvivedMidFlight: flightSamples.some(sample => sample.inShell && sample.rootMounted),
          engineInSlotBeforeShellLeft: firstShellIndex >= 0 && flightSamples.some((sample, index) => index > firstShellIndex && sample.inSlot),
           settled: {
            rootMounted: Boolean(document.querySelector('.lnl-intro')),
            staged: Boolean(document.querySelector('.lnl-intro-staged')),
            canvasIdentity: slotCanvas === engineCanvas && slotCanvas === window.__engineCanvas,
            shellRemoved: !document.querySelector('#lnl-globe-flight-shell'),
             markerCount: document.querySelectorAll('#lnl-globe-dashboard-slot .lnl-earth-overlay').length,
             haloPresent: Boolean(dashboardHalo),
             haloOrigin: dashboardHalo?.classList.contains('is-landing') ? 'landing' : 'unknown',
             haloRingCount: dashboardHalo?.querySelectorAll('.lnl-dashboard-halo-ring').length || 0,
             haloAnimations: dashboardHaloAnimations,
           },
          landedRect: landedRect.toJSON(),
          settledSlotRect: settledSlotRect.toJSON(),
          landErrorX: Math.abs(landedRect.left - settledSlotRect.left),
          landErrorY: Math.abs(landedRect.top - settledSlotRect.top),
          landWidthError: Math.abs(landedRect.width - settledSlotRect.width),
          frames: frameDeltas.length,
          maxFrame: Math.max(0, ...frameDeltas),
          maxLongTask: Math.max(0, ...longTasks),
          longTaskDurations: longTasks.map(duration => Math.round(duration)).sort((a, b) => b - a).slice(0, 5),
          probeIntro: probe.intro || null,
          probeDashboard: (window.__lnlGlobeProbe || {}).dashboard || null,
          phiAfterSettle,
          phiLater,
          phiKeepsAdvancing: phiAfterSettle !== null && phiLater !== null && phiLater > phiAfterSettle,
          phiBeforeDrag,
          phiAfterDrag,
          dragDelta: phiBeforeDrag !== null && phiAfterDrag !== null ? phiAfterDrag - phiBeforeDrag : null,
        });
      }, 70);
    }
    else if (Date.now() >= deadline) {
      clearInterval(timer);
      resolve({ state: 'timeout', hasRoot: Boolean(root), hasSlot: Boolean(slot), hasEngine: Boolean(engine) });
    }
  }, 60);
})`

const introDisabledAuditExpression = `new Promise((resolve) => {
  const deadline = Date.now() + 10000;
  const timer = setInterval(() => {
    const globe = document.querySelector('#lnl-globe-dashboard-slot canvas');
    const card = document.querySelector('.node-card');
    const shell = document.querySelector('.lnl-shell');
    const header = document.querySelector('.lnl-header');
    if (globe && card && shell && header && getComputedStyle(card).opacity !== '0') {
      clearInterval(timer);
      resolve({
        introMounted: Boolean(document.querySelector('.lnl-intro')),
        revealActive: shell.classList.contains('lnl-intro-reveal'),
        headerAnimation: getComputedStyle(header).animationName,
        cardVisible: getComputedStyle(card).opacity !== '0',
      });
    }
    else if (Date.now() >= deadline) {
      clearInterval(timer);
      resolve({ state: 'timeout' });
    }
  }, 50);
})`

const globeMotionAuditExpression = `new Promise((resolve) => {
  const deadline = Date.now() + 12000;
  const timer = setInterval(() => {
    const globe = document.querySelector('.node-earth-globe:not(.is-intro)');
    const overlay = globe?.querySelector('.lnl-earth-overlay');
    if (globe && overlay) {
      clearInterval(timer);
      setTimeout(() => {
        const before = overlay.style.transform;
        setTimeout(() => {
          resolve({
            before,
            after: overlay.style.transform,
            moved: before !== overlay.style.transform,
            mode: '__EARTH_MODE__',
          });
        }, 760);
      }, 260);
    }
    else if (Date.now() >= deadline) {
      clearInterval(timer);
      resolve({ state: 'timeout' });
    }
  }, 60);
})`

const pingContentMotionAuditExpression = `new Promise((resolve) => {
  const deadline = Date.now() + 12000;
  const timer = setInterval(() => {
    const trigger = document.querySelector('button[aria-label*="查看 Tokyo Fixture Ping 详情"]');
    if (!trigger) {
      if (Date.now() >= deadline) {
        clearInterval(timer);
        resolve({ state: 'trigger-timeout' });
      }
      return;
    }
    clearInterval(timer);
    trigger.click();
    const contentDeadline = Date.now() + 5000;
    const contentTimer = setInterval(() => {
      const panel = document.querySelector('.lnl-ping-panel.is-motion-enabled');
      const toolbar = panel?.querySelector('.lnl-ping-toolbar');
      const probe = panel?.querySelector('.lnl-ping-probe');
      const chart = panel?.querySelector('.lnl-ping-chart');
      if (toolbar && probe && chart) {
        clearInterval(contentTimer);
        const smoothingInfo = panel.querySelector('[aria-label="查看 Ping 平滑算法说明"]');
        const tooltipRoot = smoothingInfo?.closest('[data-slot="data-tooltip"]');
        tooltipRoot?.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
        setTimeout(() => {
          const tooltip = document.querySelector('body > [role="tooltip"]');
          resolve({
            toolbarAnimation: getComputedStyle(toolbar).animationName,
            probeAnimation: getComputedStyle(probe).animationName,
            chartAnimation: getComputedStyle(chart).animationName,
            chartCanvas: Boolean(chart.querySelector('canvas')),
            smoothingTooltipVisible: Boolean(tooltip && getComputedStyle(tooltip).display !== 'none'),
            smoothingTooltipText: tooltip?.textContent?.replace(/\s+/g, ' ').trim() || '',
          });
        }, 80);
      }
      else if (Date.now() >= contentDeadline) {
        clearInterval(contentTimer);
        resolve({ state: 'content-timeout' });
      }
    }, 40);
  }, 60);
})`

const mobileChromeLayoutAuditExpression = `new Promise((resolve) => {
  const deadline = Date.now() + 12000;
  const intersects = (a, b) => Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
  const timer = setInterval(() => {
    const logo = document.querySelector('.lnl-identity-mark');
    const visitor = document.querySelector('.lnl-visitor-trigger');
    const backTop = document.querySelector('.lnl-back-top');
    const searchToggle = document.querySelector('[aria-label="打开节点搜索"]');
    const earthOverlay = document.querySelector('.node-earth-globe:not(.is-intro) .lnl-earth-overlay[data-front="true"]');
    if (logo && visitor && backTop && searchToggle && earthOverlay) {
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
          const greetingVisible = /早上好|中午好|下午好|晚上好|夜深了/.test(visitor.textContent || '');
          searchToggle.click();
          earthOverlay.focus();
          earthOverlay.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true, pointerType: 'touch' }));
          earthOverlay.click();
          setTimeout(() => {
            const activeTab = document.querySelector('[role="tab"][data-state="active"]');
            const search = document.querySelector('.lnl-node-search-drawer.is-open');
            const searchField = document.querySelector('.lnl-node-search-field');
            const searchRect = search?.getBoundingClientRect();
            const searchFieldRect = searchField?.getBoundingClientRect();
            const activeTabRect = activeTab?.getBoundingClientRect();
            const touchOpened = earthOverlay.getAttribute('aria-expanded') === 'true';
            earthOverlay.click();
            setTimeout(() => {
              resolve({
                logoWidth: logoRect.width,
                logoHeight: logoRect.height,
                compactOverlap: intersects(compactVisitorRect, compactBackRect),
                expandedOverlap: intersects(expandedVisitorRect, expandedBackRect),
                searchTabOverlap: intersects(searchRect, activeTabRect),
                searchInsideViewport: Boolean(searchRect && searchRect.left >= 0 && searchRect.right <= document.documentElement.clientWidth + 0.5),
                searchFieldInsideViewport: Boolean(searchFieldRect && searchFieldRect.left >= 0 && searchFieldRect.right <= document.documentElement.clientWidth + 0.5),
                searchFieldWidth: searchFieldRect?.width || 0,
                searchFieldRadius: searchField ? getComputedStyle(searchField).borderRadius : '',
                touchOpened,
                touchClosed: earthOverlay.getAttribute('aria-expanded') === 'false',
                greetingVisible,
                documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
                viewportWidth: document.documentElement.clientWidth,
              });
            }, 40);
          }, 420);
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

const earlyIntroAuditExpression = `new Promise((resolve) => {
  const deadline = performance.now() + 1200;
  const timer = setInterval(() => {
    const intro = document.querySelector('.lnl-intro');
    if (intro) {
      clearInterval(timer);
      const track = document.querySelector('.lnl-intro-progress i');
      const animation = track?.getAnimations?.()[0];
      const navigationElapsed = performance.now();
      const progressCurrentTime = Number(animation?.currentTime || 0);
      const initialHeadline = document.querySelector('.lnl-intro-top span:last-child')?.textContent?.trim() || '';
      setTimeout(() => {
        resolve({
          mounted: true,
          navigationElapsed,
          progressCurrentTime,
          initialHeadline,
          readyHeadline: document.querySelector('.lnl-intro-top span:last-child')?.textContent?.trim() || '',
        });
      }, 3600);
    }
    else if (performance.now() >= deadline) {
      clearInterval(timer);
      resolve({ mounted: false, navigationElapsed: performance.now() });
    }
  }, 20);
})`

const mobileSearchMoveAuditExpression = `new Promise((resolve) => {
  const deadline = performance.now() + 12000;
  const timer = setInterval(() => {
    const cards = [...document.querySelectorAll('.node-card')];
    const target = cards.find(card => (card.textContent || '').includes('Frankfurt Fixture'));
    const toggle = document.querySelector('[aria-label="打开节点搜索"]');
    if (target && cards.length >= 2 && toggle) {
      clearInterval(timer);
      const wrapper = target.parentElement;
      const before = wrapper.getBoundingClientRect().top;
      toggle.click();
      setTimeout(() => {
        const input = document.querySelector('#node-search');
        input.value = 'Frankfurt';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const samples = [];
        const sampleStart = performance.now();
        const frame = () => {
          samples.push(wrapper.getBoundingClientRect().top);
          if (performance.now() - sampleStart < 1100) {
            requestAnimationFrame(frame);
            return;
          }
          const rounded = [...new Set(samples.map(value => Math.round(value * 10) / 10))];
          resolve({
            before,
            after: samples.at(-1),
            distinctPositions: rounded.length,
            transitionProperty: getComputedStyle(wrapper).transitionProperty,
            transitionDuration: getComputedStyle(wrapper).transitionDuration,
          });
        };
        requestAnimationFrame(frame);
      }, 80);
    }
    else if (performance.now() >= deadline) {
      clearInterval(timer);
      resolve({ state: 'timeout', count: cards.length });
    }
  }, 60);
})`

const mobileProbeMatrixAuditExpression = `new Promise((resolve) => {
  const deadline = Date.now() + 12000;
  const timer = setInterval(() => {
    const button = document.querySelector('button[aria-label*="查看 Tokyo Fixture Ping 详情"]');
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
            cardWidths: cards.map(card => card.getBoundingClientRect().width),
            allStatsVisible: cards.every(card => /LOSS/.test(card.textContent || '') && /JIT/.test(card.textContent || '')),
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
  let collapseTransitionProperty = '';
  let minCompactingOpacity = 1;
  let maxCompactLayerOpacity = 0;
  let compactLayerText = '';
  let maxCompactOverflow = 0;
  let maxScanHeadOverflow = 0;
  let compactCenterDeltas = null;
  let compactReachedAt = 0;
  let lastMorphWidth = null;
  let firstCompactWidth = null;
  let lastMorphHeight = null;
  let firstCompactHeight = null;
  const morphWidths = [];
  const morphHeights = [];
  let lastState = '';
  const stateTransitions = [];
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
      collapseTransitionProperty,
      minCompactingOpacity,
      maxCompactLayerOpacity,
      compactLayerText,
      maxCompactOverflow,
      maxScanHeadOverflow,
      compactCenterDeltas,
      handoffWidthDelta: lastMorphWidth === null || firstCompactWidth === null ? null : Math.abs(lastMorphWidth - firstCompactWidth),
      handoffHeightDelta: lastMorphHeight === null || firstCompactHeight === null ? null : Math.abs(lastMorphHeight - firstCompactHeight),
      distinctMorphWidths: new Set(morphWidths.map(value => Math.round(value))).size,
      distinctMorphHeights: new Set(morphHeights.map(value => Math.round(value))).size,
      stateTransitions,
      scanningEntries: stateTransitions.filter(value => value === 'scanning').length,
      postCompactTransitions: stateTransitions.slice(stateTransitions.indexOf('compact') + 1),
      frames: frameDeltas.length,
      maxFrame: frameDeltas.length ? Math.max(...frameDeltas) : 0,
      maxLongTask: longTasks.length ? Math.max(...longTasks) : 0,
      longTaskDurations: longTasks.map(duration => Math.round(duration)).sort((a, b) => b - a).slice(0, 5),
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
    if (state && state !== lastState) {
      stateTransitions.push(state);
      lastState = state;
    }
    if (state === 'morphing') {
      observingCollapse = true;
      compactingSeen = true;
    }
    if (observingCollapse) {
      frameDeltas.push(now - previousFrame);
      const trigger = visitor?.querySelector('.lnl-visitor-trigger');
      const rect = trigger?.getBoundingClientRect();
      if (rect) {
        const style = getComputedStyle(trigger);
        collapseTransitionProperty ||= style.transitionProperty;
        if (state === 'morphing') {
          const expandedLayer = visitor?.querySelector('.lnl-visitor-expanded-layer');
          minCompactingOpacity = Math.min(minCompactingOpacity, Number(getComputedStyle(expandedLayer).opacity));
          lastMorphWidth = rect.width;
          lastMorphHeight = rect.height;
          morphWidths.push(rect.width);
          morphHeights.push(rect.height);
        }
        if (state === 'compact' && firstCompactWidth === null) {
          firstCompactWidth = rect.width;
          firstCompactHeight = rect.height;
          const compactSource = visitor?.querySelector('.lnl-visitor-compact-source');
          const compactIp = visitor?.querySelector('.lnl-visitor-compact-layer > span:last-child');
          const compactAction = visitor?.querySelector('.lnl-visitor-action');
          const centerY = rect.top + rect.height / 2;
          compactCenterDeltas = Object.fromEntries([
            ['source', compactSource],
            ['ip', compactIp],
            ['action', compactAction],
          ].map(([key, element]) => {
            const elementRect = element?.getBoundingClientRect();
            return [key, elementRect ? Math.abs(elementRect.top + elementRect.height / 2 - centerY) : null];
          }));
        }
        const compactLayer = visitor?.querySelector('.lnl-visitor-compact-layer');
        if (compactLayer) {
          maxCompactLayerOpacity = Math.max(maxCompactLayerOpacity, Number(getComputedStyle(compactLayer).opacity));
          compactLayerText = compactLayer.textContent?.trim() || compactLayerText;
          maxCompactOverflow = Math.max(maxCompactOverflow, compactLayer.scrollWidth - compactLayer.clientWidth);
        }
        const scanHead = visitor?.querySelector('.lnl-visitor-scan-head');
        if (scanHead)
          maxScanHeadOverflow = Math.max(maxScanHeadOverflow, scanHead.scrollWidth - scanHead.clientWidth);
        widths.push(rect.width);
        heights.push(rect.height);
        heightSamples.push({ state, height: rect.height, time: now });
      }
    }
    previousFrame = now;
    if (observingCollapse && state === 'compact') {
      compactReachedAt ||= now;
      if (now - compactReachedAt >= 900) {
        finish('compact');
        return;
      }
    }
    if (now >= deadline) {
      finish(state || 'timeout');
      return;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
})`

const visitorReopenAuditExpression = `new Promise((resolve) => {
  const deadline = Date.now() + 16000;
  const timer = setInterval(() => {
    const visitor = document.querySelector('.lnl-visitor[data-presentation-state="compact"]');
    const trigger = visitor?.querySelector('.lnl-visitor-trigger');
    if (visitor && trigger) {
      clearInterval(timer);
      trigger.click();
      setTimeout(() => {
        const expandedLayer = visitor.querySelector('.lnl-visitor-expanded-layer');
        const compactLayer = visitor.querySelector('.lnl-visitor-compact-layer');
        const rows = [...visitor.querySelectorAll('.lnl-visitor-row')];
        resolve({
          expanded: visitor.classList.contains('is-expanded'),
          expandedOpacity: expandedLayer ? Number(getComputedStyle(expandedLayer).opacity) : -1,
          compactOpacity: compactLayer ? Number(getComputedStyle(compactLayer).opacity) : -1,
          rowCount: rows.length,
          labels: rows.map(row => row.querySelector('small')?.textContent?.trim() || ''),
          text: expandedLayer?.textContent?.replace(/\\s+/g, ' ').trim() || '',
        });
      }, 620);
    }
    else if (Date.now() >= deadline) {
      clearInterval(timer);
      resolve({ state: 'timeout' });
    }
  }, 80);
})`

const searchGeometryAuditExpression = `new Promise((resolve) => {
  const deadline = Date.now() + 10000;
  const timer = setInterval(() => {
    const toggle = document.querySelector('[aria-label="打开节点搜索"]');
    if (toggle) {
      clearInterval(timer);
      toggle.click();
      setTimeout(() => {
        const drawer = document.querySelector('.lnl-node-search-drawer.is-open');
        const inner = document.querySelector('.lnl-node-search-drawer-inner');
        const field = document.querySelector('.lnl-node-search-field');
        const input = document.querySelector('.lnl-node-search-input');
        const drawerRect = drawer?.getBoundingClientRect();
        const fieldRect = field?.getBoundingClientRect();
        resolve({
          viewportWidth: document.documentElement.clientWidth,
          documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
          drawerContained: Boolean(drawerRect && drawerRect.left >= -0.5 && drawerRect.right <= document.documentElement.clientWidth + 0.5),
          fieldContained: Boolean(fieldRect && drawerRect && fieldRect.left >= drawerRect.left - 0.5 && fieldRect.right <= drawerRect.right + 0.5),
          fieldWidth: fieldRect?.width || 0,
          drawerOverflow: drawer ? drawer.scrollWidth - drawer.clientWidth : -1,
          innerOverflow: inner ? inner.scrollWidth - inner.clientWidth : -1,
          inputBorderWidth: input ? getComputedStyle(input).borderWidth : '',
        });
      }, 480);
    }
    else if (Date.now() >= deadline) {
      clearInterval(timer);
      resolve({ state: 'timeout' });
    }
  }, 80);
})`

const slowPublicSettingsShellAuditExpression = `new Promise((resolve) => {
  const deadline = performance.now() + 1800;
  const timer = setInterval(() => {
    const shell = document.querySelector('.lnl-shell');
    const header = document.querySelector('header');
    if (shell && header) {
      clearInterval(timer);
      resolve({
        mounted: true,
        navigationElapsed: performance.now(),
        introVisible: Boolean(document.querySelector('.lnl-intro')),
        bootFallbackVisible: Boolean(document.querySelector('#lnl-boot-fallback')),
      });
    }
    else if (performance.now() >= deadline) {
      clearInterval(timer);
      resolve({ mounted: false, navigationElapsed: performance.now(), bootFallbackVisible: Boolean(document.querySelector('#lnl-boot-fallback')) });
    }
  }, 20);
})`

const visitorFixtureInitScript = `(() => {
  sessionStorage.setItem('komari-observatory:intro:1.4.3-fix2', 'seen');
  sessionStorage.removeItem('komari-observatory:visitor-presentation:1.4.3');
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
  const result = await runInteractivePage(name, width, height, pingDialogOpenExpression, name, `sessionStorage.setItem('komari-observatory:intro:1.4.3-fix2', 'seen');`)
  assert.equal(result?.state, 'opened')
  assert.ok(result?.left >= -0.5 && result?.right <= result?.viewportWidth + 0.5, `Ping dialog escaped viewport: ${JSON.stringify(result)}`)
  assert.ok(result?.centerError <= 1, `Ping dialog is not centered: ${JSON.stringify(result)}`)
}

async function auditMobileFinanceOverflow(width) {
  const screenshotName = process.env.SMOKE_SCREENSHOT_DIR && width === 390 ? 'mobile-finance-open' : undefined
  const result = await runInteractivePage(`mobile-finance-audit-${width}`, width, 844, financeOverflowAuditExpression, screenshotName, `sessionStorage.setItem('komari-observatory:intro:1.4.3-fix2', 'seen');`)
  assert.equal(result?.state, 'opened')
  assert.doesNotMatch(result?.triggerText ?? '', financeDetailsLabelPattern)
  assert.equal(result?.assistiveHintHidden, true, `Finance assistive hint became visible: ${JSON.stringify(result)}`)
  assert.equal(result?.textFits, true, `Finance trigger text escaped its card: ${JSON.stringify(result)}`)
  assert.equal(result?.viewportWidth, width)
  assert.ok(result?.documentWidth <= result?.viewportWidth, `Mobile document overflowed: ${JSON.stringify(result)}`)
  assert.ok(result?.left >= 0 && result?.right <= result?.viewportWidth + 0.5, `Finance panel escaped viewport: ${JSON.stringify(result)}`)
  assert.equal(result?.triggerFillsCell, true, `Finance trigger did not fill its mobile cell: ${JSON.stringify(result)}`)
  assert.ok(result?.triggerCellRightInset >= -0.5 && result?.triggerCellRightInset <= 12, `Finance trigger was not aligned within the mobile cell: ${JSON.stringify(result)}`)
  assert.ok(result?.chevronRightInset >= -0.5 && result?.chevronRightInset <= 2, `Finance chevron was not aligned to the mobile cell edge: ${JSON.stringify(result)}`)
}

async function auditNodeFinanceStates(width) {
  const initScript = `sessionStorage.setItem('komari-observatory:intro:1.4.3-fix2', 'seen');`
  const defaultResult = await runInteractivePage(
    `node-finance-states-default-${width}`,
    width,
    844,
    nodeFinanceStateAuditExpression,
    undefined,
    initScript,
  )
  reportBrowserAudit(`node-finance-states-default-${width}`, defaultResult)
  assert.equal(defaultResult?.viewportWidth, width)
  assert.ok(defaultResult?.documentWidth <= defaultResult?.viewportWidth, `Finance states overflowed ${width}px viewport: ${JSON.stringify(defaultResult)}`)
  assert.equal(defaultResult?.states?.every(state => state.insideCard), true, `Finance content escaped its node card: ${JSON.stringify(defaultResult)}`)
  assert.match(defaultResult?.states?.find(state => state.state === 'free')?.text ?? '', freeFinancePattern)
  assert.doesNotMatch(defaultResult?.states?.find(state => state.state === 'paid')?.text ?? '', fixedFinanceLabelPattern)

  clients[1].price = 0
  try {
    const missingResult = await runInteractivePage(
      `node-finance-states-missing-${width}`,
      width,
      844,
      nodeFinanceStateAuditExpression,
      undefined,
      initScript,
    )
    reportBrowserAudit(`node-finance-states-missing-${width}`, missingResult)
    assert.equal(missingResult?.states?.every(state => state.insideCard), true, `Missing finance prompt escaped its node card: ${JSON.stringify(missingResult)}`)
    assert.match(missingResult?.states?.find(state => state.state === 'missing')?.text ?? '', missingFinancePattern)
  }
  finally {
    clients[1].price = -1
  }
}

function reportBrowserAudit(name, result) {
  console.log(`[browser-audit] ${name}: ${JSON.stringify(result)}`)
}

async function auditPingBarGeometry() {
  const result = await runInteractivePage(
    'node-ping-bar-geometry',
    1440,
    900,
    pingBarGeometryAuditExpression,
    undefined,
    `sessionStorage.setItem('komari-observatory:intro:1.4.3-fix2', 'seen');`,
  )
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
    `sessionStorage.setItem('komari-observatory:intro:1.4.3-fix2', 'seen'); localStorage.setItem('appearance', 'light'); localStorage.setItem('leonetlab:appearance:user-override', '1');`,
  )
  reportBrowserAudit('globe-flags-theme-change', result)
  assert.equal(result?.initialCount, 4, `Expected four globe flag overlays: ${JSON.stringify(result)}`)
  assert.equal(result?.markerOverlap, false, `Globe flag overlaps its online count: ${JSON.stringify(result)}`)
  assert.equal(result?.canvasSame, true, `Theme switch recreated the globe canvas: ${JSON.stringify(result)}`)
  assert.equal(result?.minCount, 4, `Globe flags disappeared during theme switch: ${JSON.stringify(result)}`)
  assert.equal(result?.allLoaded, true, `A globe flag asset failed to load: ${JSON.stringify(result)}`)
  assert.equal(result?.allDisplayed, true, `A globe flag was hidden: ${JSON.stringify(result)}`)
  assert.equal(result?.flagsNotDraggable, true, `Globe flag images still expose native dragging: ${JSON.stringify(result)}`)
  assert.equal(result?.nativeFlagDragPrevented, true, `Native flag dragging was not cancelled: ${JSON.stringify(result)}`)
  assert.equal(result?.flagDragMoved, true, `Dragging from a flag did not rotate the globe: ${JSON.stringify(result)}`)
  assert.equal(result?.overlayMoved, true, `Globe drag did not change the projected flag position: ${JSON.stringify(result)}`)
  assert.equal(result?.draggingEnded, true, `Globe drag state did not settle: ${JSON.stringify(result)}`)
  assert.ok(result?.activeOverlayZ > result?.maxSiblingZ, `Regional readout did not rise above sibling flags: ${JSON.stringify(result)}`)
  assert.ok(result?.activeFlagOpacity < 0.2, `Active flag did not clear the regional readout: ${JSON.stringify(result)}`)
  assert.match(result?.regionReadout || '', regionCpuPattern, `Regional CPU telemetry did not open: ${JSON.stringify(result)}`)
  assert.match(result?.regionReadout || '', regionThroughputPattern, `Regional throughput telemetry did not open: ${JSON.stringify(result)}`)
}

async function auditGlobeRegionInteraction() {
  const result = await runInteractivePage(
    'globe-region-interaction',
    1100,
    780,
    globeRegionInteractionAuditExpression,
    undefined,
    `window.__lnlGlobeProbe = {}; sessionStorage.setItem('komari-observatory:intro:1.4.3-fix2', 'seen');`,
  )
  reportBrowserAudit('globe-region-interaction', result)
  assert.equal(result?.openedTooEarly, false, `Region preview skipped hover intent delay: ${JSON.stringify(result)}`)
  assert.equal(result?.hoverOpened, true, `Region preview did not open after hover intent: ${JSON.stringify(result)}`)
  assert.equal(result?.pinnedSurvivedLeave, true, `Pinned region closed on pointer leave: ${JSON.stringify(result)}`)
  assert.equal(result?.outsideClosed, true, `Outside pointer did not close the pinned region: ${JSON.stringify(result)}`)
  assert.ok(result?.pausedDelta !== null && result.pausedDelta < 0.012, `Globe did not settle while the readout was open: ${JSON.stringify(result)}`)
  assert.ok(result?.resumedDelta !== null && result.resumedDelta > result.pausedDelta, `Globe did not resume smoothly after closing the readout: ${JSON.stringify(result)}`)
  assert.equal(result?.keyboardOpened, true, `Keyboard focus did not open regional telemetry: ${JSON.stringify(result)}`)
  assert.equal(result?.escapeClosed, true, `Escape did not close regional telemetry: ${JSON.stringify(result)}`)
  assert.equal(result?.readoutInsideViewport, true, `Regional readout escaped the viewport: ${JSON.stringify(result)}`)
}

async function auditGlobeRouteRipple() {
  const result = await runInteractivePage(
    'globe-route-ripple',
    1100,
    780,
    globeRouteRippleAuditExpression,
    undefined,
    `sessionStorage.setItem('komari-observatory:intro:1.4.3-fix2', 'seen');`,
  )
  reportBrowserAudit('globe-route-ripple', result)
  assert.equal(result?.routeRipple, true, `Returning home did not trigger the route ripple: ${JSON.stringify(result)}`)
  assert.equal(result?.duration900, true, `Route ripple duration drifted: ${JSON.stringify(result)}`)
  assert.equal(result?.canvasCount, 1, `Route navigation recreated the globe canvas: ${JSON.stringify(result)}`)
  assert.equal(result?.path, '/', `Route ripple did not settle on the home page: ${JSON.stringify(result)}`)
}

async function auditPingDialogCloseAnimation() {
  const result = await runInteractivePage(
    'ping-dialog-close-animation',
    1100,
    780,
    pingDialogCloseAuditExpression,
    undefined,
    `sessionStorage.setItem('komari-observatory:intro:1.4.3-fix2', 'seen');`,
  )
  reportBrowserAudit('ping-dialog-close-animation', result)
  assert.equal(result?.closedSeen, true, `Ping dialog skipped its closed state: ${JSON.stringify(result)}`)
  assert.ok(result?.closedFrames >= 2, `Ping dialog exit animation had too few frames: ${JSON.stringify(result)}`)
}

async function auditIntroGlobeHandoff() {
  const result = await runInteractivePage('intro-globe-handoff', 1100, 780, introHandoffAuditExpression, undefined, 'window.__lnlGlobeProbe = {};')
  reportBrowserAudit('intro-globe-handoff', result)
  assert.equal(result?.staged, true, `Dashboard content was not staged behind the intro: ${JSON.stringify(result)}`)
  assert.equal(result?.introMarkerCount, 0, `Intro globe should remain flag-free during handoff: ${JSON.stringify(result)}`)
  assert.equal(result?.introRotated, true, `Intro globe did not rotate before handoff: ${JSON.stringify(result)}`)
  // 单实例交接：引擎必须真实经过飞行壳，且封面要活到飞行中段之后。
  assert.equal(result?.sawFlightShell, true, `Engine never entered the flight shell: ${JSON.stringify(result)}`)
  assert.equal(result?.coverSurvivedMidFlight, true, `Intro cover did not survive the flight: ${JSON.stringify(result)}`)
  assert.equal(result?.engineInSlotBeforeShellLeft, true, `Engine did not land in the dashboard slot: ${JSON.stringify(result)}`)
  assert.equal(result?.flightSamples?.every(sample => sample.connected), true, `Intro canvas disconnected during handoff: ${JSON.stringify(result?.flightSamples)}`)
  assert.equal(result?.flightSamples?.every(sample => sample.opacity > 0 && sample.visibility !== 'hidden'), true, `Intro canvas became invisible during handoff: ${JSON.stringify(result?.flightSamples)}`)
  assert.ok(result?.distinctFlightPositions >= 3, `Intro globe did not render intermediate flight positions: ${JSON.stringify(result?.flightSamples)}`)
  assert.equal(result?.sawIntermediateMotion, true, `Intro globe snapped to its destination instead of translating: ${JSON.stringify(result?.flightSamples)}`)
  // 平滑度：飞行期间同一 canvas 到目标的距离必须单调收敛，不允许瞬移跳变。
  assert.ok(result?.maxDistanceJump < 24, `Engine teleported mid-flight (max distance jump ${result?.maxDistanceJump}px): ${JSON.stringify(result?.flightSamples)}`)
  // 落点：引擎矩形与 dashboard 槽位矩形误差 <2px。
  assert.ok(result?.landErrorX < 2 && result?.landErrorY < 2 && result?.landWidthError < 2, `Engine landed off the dashboard slot: ${JSON.stringify(result)}`)
  // canvas 身份：槽位里的 canvas 必须就是 intro 里的那一个（同一 WebGL 上下文）。
  assert.equal(result?.settled?.canvasIdentity, true, `Dashboard canvas is not the intro canvas (engine was recreated): ${JSON.stringify(result)}`)
  assert.equal(result?.settled?.shellRemoved, true, `Flight shell was not removed after landing: ${JSON.stringify(result)}`)
  assert.equal(result?.settled?.markerCount, 4, `Dashboard flags did not appear after landing: ${JSON.stringify(result)}`)
  assert.equal(result?.settled?.haloPresent, true, `Dashboard landing ripple did not mount: ${JSON.stringify(result)}`)
  assert.equal(result?.settled?.haloOrigin, 'landing', `Dashboard used the wrong ripple cadence after landing: ${JSON.stringify(result)}`)
  assert.equal(result?.settled?.haloRingCount, 2, `Dashboard ripple did not render two progressive rings: ${JSON.stringify(result)}`)
  assert.ok(result?.settled?.haloAnimations?.some(animation => animation.duration === 1200), `Dashboard landing ripple duration drifted: ${JSON.stringify(result)}`)
  assert.equal(result?.settled?.rootMounted, false, `Intro cover remained after its handoff duration: ${JSON.stringify(result)}`)
  assert.equal(result?.settled?.staged, false, `Dashboard content stayed staged after the handoff: ${JSON.stringify(result)}`)
  assert.ok(result?.frames >= 20, `Intro handoff produced too few animation frames: ${JSON.stringify(result)}`)
  assert.ok(result?.maxFrame < introHandoffFrameGapLimitMs, `Intro handoff stalled between frames (limit ${introHandoffFrameGapLimitMs}ms): ${JSON.stringify(result)}`)
  // 交接几何与帧推进由上面的断言保证；longtask 阈值见文件头说明，
  // 观测到的任务时长随审计报告输出以保留诊断价值。
  assert.ok(result?.maxLongTask < longTaskHardLimitMs, `Intro handoff produced a main-thread task over ${longTaskHardLimitMs}ms (observed: ${JSON.stringify(result?.longTaskDurations ?? [])}): ${JSON.stringify(result)}`)
  // 相位连续性是"同一实例"的天然结果，仍用探针兜底：自转继续、拖拽可用。
  assert.ok(result?.probeIntro, `Intro globe orientation probe was not recorded: ${JSON.stringify(result)}`)
  assert.ok(result?.probeDashboard, `Dashboard globe orientation probe was not recorded: ${JSON.stringify(result)}`)
  assert.equal(result?.phiKeepsAdvancing, true, `Globe auto-rotation stalled after landing: ${JSON.stringify(result)}`)
  assert.ok(result?.dragDelta !== null && result?.dragDelta > 0.5, `Globe did not respond to drag after landing (delta=${result?.dragDelta}): ${JSON.stringify(result)}`)
}

async function auditIntroDisabledReveal() {
  introAnimationEnabledFixture = false
  try {
    const result = await runInteractivePage('intro-disabled-reveal', 1100, 780, introDisabledAuditExpression)
    reportBrowserAudit('intro-disabled-reveal', result)
    assert.equal(result?.introMounted, false, `Disabled intro still mounted its cover: ${JSON.stringify(result)}`)
    assert.equal(result?.revealActive, true, `Disabled intro skipped the staged dashboard reveal: ${JSON.stringify(result)}`)
    assert.equal(result?.cardVisible, true, `Dashboard cards did not become visible: ${JSON.stringify(result)}`)
  }
  finally {
    introAnimationEnabledFixture = true
  }
}

async function auditMetricStoreFallback() {
  metricStoreUninitializedFixture = true
  try {
    const before = rpcCalls.length
    const result = await runInteractivePage(
      'metric-store-fallback',
      1100,
      780,
      pingDialogOpenExpression,
      undefined,
      `sessionStorage.setItem('komari-observatory:intro:1.4.3-fix2', 'seen');`,
    )
    reportBrowserAudit('metric-store-fallback', result)
    assert.equal(result?.state, 'opened', `Ping dialog did not open behind an uninitialized metric store: ${JSON.stringify(result)}`)
    const calls = rpcCalls.slice(before)
    assert.ok(calls.some(call => call.method === 'public:queryMetrics'), `Metric RPC was not attempted: ${JSON.stringify(calls)}`)
    assert.ok(
      calls.some(call => call.method === 'common:getRecords' && call.params?.type === 'ping' && call.params?.uuid === nodeUuid),
      `Ping dialog did not fall back to common:getRecords after the -32603 metric-store error: ${JSON.stringify(calls)}`,
    )
  }
  finally {
    metricStoreUninitializedFixture = false
  }
}

async function auditGlobeMotionMode(mode, expectedMoved) {
  earthViewModeFixture = mode
  try {
    const result = await runInteractivePage(
      `globe-motion-${mode}`,
      1100,
      780,
      globeMotionAuditExpression.replace('__EARTH_MODE__', mode),
      undefined,
      `sessionStorage.setItem('komari-observatory:intro:1.4.3-fix2', 'seen');`,
    )
    reportBrowserAudit(`globe-motion-${mode}`, result)
    assert.equal(result?.moved, expectedMoved, `Unexpected ${mode} globe motion: ${JSON.stringify(result)}`)
  }
  finally {
    earthViewModeFixture = 'earth'
  }
}

async function auditPingContentMotion() {
  const result = await runInteractivePage(
    'ping-content-motion',
    1100,
    780,
    pingContentMotionAuditExpression,
    undefined,
    `sessionStorage.setItem('komari-observatory:intro:1.4.3-fix2', 'seen');`,
  )
  reportBrowserAudit('ping-content-motion', result)
  assert.match(result?.toolbarAnimation || '', pingSectionInPattern, `Ping toolbar has no entrance transition: ${JSON.stringify(result)}`)
  assert.match(result?.probeAnimation || '', pingSectionInPattern, `Ping probes have no entrance transition: ${JSON.stringify(result)}`)
  assert.match(result?.chartAnimation || '', pingChartInPattern, `Ping chart has no entrance transition: ${JSON.stringify(result)}`)
  assert.equal(result?.chartCanvas, true, `Ping chart canvas did not render: ${JSON.stringify(result)}`)
  assert.equal(result?.smoothingTooltipVisible, true, `Ping smoothing tooltip did not open on hover: ${JSON.stringify(result)}`)
  assert.match(result?.smoothingTooltipText || '', ewmaPattern, `Ping smoothing tooltip is missing its algorithm explanation: ${JSON.stringify(result)}`)
}

async function auditMobileProbeMatrix() {
  const result = await runInteractivePage('mobile-probe-matrix', 390, 844, mobileProbeMatrixAuditExpression)
  reportBrowserAudit('mobile-probe-matrix', result)
  assert.equal(result?.count, 3, `Expected three mobile probes: ${JSON.stringify(result)}`)
  assert.ok(result?.scrollWidth > result?.clientWidth + 1, `Mobile probes did not expose the intended horizontal rail: ${JSON.stringify(result)}`)
  assert.equal(result?.rows, 1, `Mobile probes should remain on one horizontal rail: ${JSON.stringify(result)}`)
  assert.equal(result?.cardWidths?.every(width => width >= 190 && width <= 260), true, `Mobile probe width escaped the readable range: ${JSON.stringify(result)}`)
  assert.equal(result?.allStatsVisible, true, `Mobile probe cards lost LOSS or JIT data: ${JSON.stringify(result)}`)
}

async function auditVisitorCollapse() {
  visitorInfoEnabledFixture = true
  try {
    const audits = [
      { label: 'mobile-320', width: 320, height: 720 },
      { label: 'mobile-390', width: 390, height: 844 },
      { label: 'desktop', width: 1100, height: 760 },
    ]
    for (const audit of audits) {
      const result = await runInteractivePage(`visitor-collapse-${audit.label}`, audit.width, audit.height, visitorCollapseAuditExpression, undefined, visitorFixtureInitScript)
      reportBrowserAudit(`visitor-collapse-${audit.label}`, result)
      assert.equal(result?.state, 'compact', `${audit.label} visitor presentation did not finish: ${JSON.stringify(result)}`)
      assert.equal(result?.compactingSeen, true, `${audit.label} visitor morphing phase was skipped: ${JSON.stringify(result)}`)
      assert.ok(result?.frames >= 20, `${audit.label} visitor collapse produced too few animation frames: ${JSON.stringify(result)}`)
      assert.ok(result?.maxFrame < 160, `${audit.label} visitor collapse stalled for too long: ${JSON.stringify(result)}`)
      assert.ok(result?.maxLongTask < longTaskHardLimitMs, `${audit.label} visitor collapse produced a main-thread task over ${longTaskHardLimitMs}ms (observed: ${JSON.stringify(result?.longTaskDurations ?? [])}): ${JSON.stringify(result)}`)
      assert.ok((result?.handoffWidthDelta ?? Number.POSITIVE_INFINITY) <= 2, `${audit.label} visitor changed width when morphing handed off to the clickable bar: ${JSON.stringify(result)}`)
      assert.ok((result?.handoffHeightDelta ?? Number.POSITIVE_INFINITY) <= 2, `${audit.label} visitor changed height when morphing handed off to the clickable bar: ${JSON.stringify(result)}`)
      assert.ok(result?.minCompactingOpacity <= 0.12, `${audit.label} visitor expanded layer did not cross-fade during compact morph: ${JSON.stringify(result)}`)
      assert.ok(result?.maxCompactLayerOpacity >= 0.9, `${audit.label} visitor compact bar never became visible during morph: ${JSON.stringify(result)}`)
      assert.match(result?.compactLayerText ?? '', visitorResolvedInfoPattern, `${audit.label} visitor compact bar lost resolved information: ${JSON.stringify(result)}`)
      assert.equal(Object.values(result?.compactCenterDeltas ?? {}).every(value => typeof value === 'number' && value <= 0.75), true, `${audit.label} compact visitor details are not vertically centered: ${JSON.stringify(result)}`)
      if (audit.label.startsWith('mobile')) {
        assert.ok(result?.maxCompactOverflow <= 1, `${audit.label} compact visitor text overflowed while shrinking: ${JSON.stringify(result)}`)
        assert.ok(result?.maxScanHeadOverflow <= 1, `${audit.label} visitor scan heading overflowed while shrinking: ${JSON.stringify(result)}`)
      }
      assert.equal(result?.scanningEntries, 1, `${audit.label} visitor scan phase replayed: ${JSON.stringify(result)}`)
      assert.deepEqual(result?.postCompactTransitions, [], `${audit.label} visitor restarted after reaching compact state: ${JSON.stringify(result)}`)
      assert.ok(result?.distinctMorphHeights >= 6, `${audit.label} visitor did not continuously interpolate its height toward the final bar: ${JSON.stringify(result)}`)
      if (audit.label === 'desktop')
        assert.ok(result?.distinctMorphWidths >= 6, `Desktop visitor did not continuously interpolate toward the final bar: ${JSON.stringify(result)}`)
    }
  }
  finally {
    visitorInfoEnabledFixture = false
  }
}

async function auditVisitorReopen() {
  visitorInfoEnabledFixture = true
  try {
    const result = await runInteractivePage('visitor-reopen-mobile', 390, 844, visitorReopenAuditExpression, undefined, visitorFixtureInitScript)
    reportBrowserAudit('visitor-reopen', result)
    assert.equal(result?.expanded, true, `Visitor card did not reopen after compacting: ${JSON.stringify(result)}`)
    assert.ok(result?.expandedOpacity >= 0.95, `Visitor expanded content stayed hidden: ${JSON.stringify(result)}`)
    assert.ok(result?.compactOpacity <= 0.05, `Visitor compact layer covered reopened details: ${JSON.stringify(result)}`)
    assert.ok(result?.rowCount >= 7, `Visitor details are incomplete: ${JSON.stringify(result)}`)
    assert.deepEqual(result?.labels, ['来源', '设备', '地址', '浏览器', '网络', 'ASN', '访问时间'])
    assert.match(result?.text ?? '', visitorResolvedInfoPattern, `Visitor details lost resolved information: ${JSON.stringify(result)}`)
  }
  finally {
    visitorInfoEnabledFixture = false
  }
}

async function auditSearchGeometry(width) {
  const result = await runInteractivePage(
    `search-geometry-${width}`,
    width,
    width <= 760 ? 844 : 900,
    searchGeometryAuditExpression,
    undefined,
    `sessionStorage.setItem('komari-observatory:intro:1.4.3-fix2', 'seen');`,
  )
  reportBrowserAudit(`search-geometry-${width}`, result)
  assert.equal(result?.drawerContained, true, `Search drawer escaped its viewport: ${JSON.stringify(result)}`)
  assert.equal(result?.fieldContained, true, `Search field escaped its drawer: ${JSON.stringify(result)}`)
  assert.ok(result?.fieldWidth <= Math.min(728, width), `Search field exceeded its intended width: ${JSON.stringify(result)}`)
  assert.ok(result?.drawerOverflow <= 1, `Search drawer still overflows horizontally: ${JSON.stringify(result)}`)
  assert.ok(result?.innerOverflow <= 1, `Search drawer inner area still overflows: ${JSON.stringify(result)}`)
  assert.equal(result?.inputBorderWidth, '0px', `Nested search input still renders a second border: ${JSON.stringify(result)}`)
  assert.ok(result?.documentWidth <= result?.viewportWidth, `Search opened horizontal document overflow: ${JSON.stringify(result)}`)
}

async function auditSlowPublicSettingsShell() {
  publicSettingsDelayMsFixture = 2600
  introAnimationEnabledFixture = false
  try {
    const result = await runInteractivePage('slow-public-settings-shell', 1100, 780, slowPublicSettingsShellAuditExpression)
    reportBrowserAudit('slow-public-settings-shell', result)
    assert.equal(result?.mounted, true, `Slow public settings left the PWA shell blank: ${JSON.stringify(result)}`)
    assert.ok(result?.navigationElapsed < 1700, `Safe shell mounted too late: ${JSON.stringify(result)}`)
    assert.equal(result?.introVisible, false, `A late settings response started the intro halfway through boot: ${JSON.stringify(result)}`)
    assert.equal(result?.bootFallbackVisible, false, `Static boot fallback was not replaced by Vue: ${JSON.stringify(result)}`)
  }
  finally {
    publicSettingsDelayMsFixture = 0
    introAnimationEnabledFixture = true
  }
}

async function auditMobileChromeLayout() {
  visitorInfoEnabledFixture = true
  try {
    const initScript = `${visitorFixtureInitScript}\nsessionStorage.setItem('komari-observatory:intro:1.4.3-fix2', 'seen');`
    const result = await runInteractivePage('mobile-chrome-layout', 390, 844, mobileChromeLayoutAuditExpression, undefined, initScript)
    reportBrowserAudit('mobile-chrome-layout', result)
    assert.ok(Math.abs(result?.logoWidth - result?.logoHeight) < 0.5, `Mobile logo frame is not square: ${JSON.stringify(result)}`)
    assert.equal(result?.compactOverlap, false, `Compact visitor card overlaps back-to-top: ${JSON.stringify(result)}`)
    assert.equal(result?.expandedOverlap, false, `Expanded visitor card overlaps back-to-top: ${JSON.stringify(result)}`)
    assert.equal(result?.searchTabOverlap, false, `Mobile search overlaps the active group tab: ${JSON.stringify(result)}`)
    assert.equal(result?.searchInsideViewport, true, `Mobile search escaped the viewport: ${JSON.stringify(result)}`)
    assert.equal(result?.searchFieldInsideViewport, true, `Mobile search field escaped the viewport: ${JSON.stringify(result)}`)
    assert.ok(result?.searchFieldWidth <= result?.viewportWidth, `Mobile search field is wider than the viewport: ${JSON.stringify(result)}`)
    assert.notEqual(result?.searchFieldRadius, '0px', `Mobile search field lost the rounded design language: ${JSON.stringify(result)}`)
    assert.equal(result?.touchOpened, true, `A single touch did not open regional telemetry: ${JSON.stringify(result)}`)
    assert.equal(result?.touchClosed, true, `A second touch did not close regional telemetry: ${JSON.stringify(result)}`)
    assert.equal(result?.greetingVisible, true, `Expanded visitor card has no time greeting: ${JSON.stringify(result)}`)
    assert.ok(result?.documentWidth <= result?.viewportWidth, `Mobile chrome overflowed horizontally: ${JSON.stringify(result)}`)
  }
  finally {
    visitorInfoEnabledFixture = false
  }
}

async function auditMobileIntroTypography() {
  const result = await runInteractivePage(
    'mobile-intro-typography',
    390,
    844,
    mobileIntroTypographyAuditExpression,
    undefined,
    `sessionStorage.removeItem('komari-observatory:intro:1.4.3-fix2');`,
  )
  reportBrowserAudit('mobile-intro-typography', result)
  assert.ok(result?.left >= -0.5 && result?.right <= result?.viewportWidth + 0.5, `Mobile intro title escaped viewport: ${JSON.stringify(result)}`)
  assert.ok(result?.scrollWidth <= result?.clientWidth + 1, `Mobile intro title overflowed its column: ${JSON.stringify(result)}`)
}

async function auditEarlyIntroBeforeSlowNodes() {
  nodeResponseDelayMsFixture = 2500
  try {
    const result = await runInteractivePage('intro-before-slow-nodes', 1100, 780, earlyIntroAuditExpression)
    reportBrowserAudit('intro-before-slow-nodes', result)
    assert.equal(result?.mounted, true, `Intro waited for slow node RPC responses: ${JSON.stringify(result)}`)
    assert.ok(result?.navigationElapsed < 1400, `Intro appeared too late: ${JSON.stringify(result)}`)
    assert.ok(result?.progressCurrentTime < 1800, `Intro first became visible after its progress animation was already half complete: ${JSON.stringify(result)}`)
    assert.match(result?.initialHeadline ?? '', introSyncingPattern, `Intro exposed a false 0\/0 node count before synchronization: ${JSON.stringify(result)}`)
    assert.match(result?.readyHeadline ?? '', introReadyNodesPattern, `Intro node telemetry did not settle after the delayed response: ${JSON.stringify(result)}`)
  }
  finally {
    nodeResponseDelayMsFixture = 0
  }
}

async function auditMobileSearchMove() {
  const result = await runInteractivePage(
    'mobile-search-move',
    390,
    844,
    mobileSearchMoveAuditExpression,
    undefined,
    `sessionStorage.setItem('komari-observatory:intro:1.4.3-fix2', 'seen');`,
  )
  reportBrowserAudit('mobile-search-move', result)
  assert.ok(result?.after < result?.before - 100, `Filtered card did not move to the first slot: ${JSON.stringify(result)}`)
  assert.ok(result?.distinctPositions >= 4, `Filtered card jumped without intermediate frames: ${JSON.stringify(result)}`)
}

if (externalFixtureDriver) {
  console.log('[fixture] waiting for an external browser test driver')
  // Playwright owns this subprocess and terminates the full process tree after
  // the suite. Do not consume its shutdown signal: doing so leaves cmd.exe
  // waiting on Windows even after every browser context has closed.
  await new Promise(() => {})
}
else {
  try {
    const html = await dumpDom('home', '/')

    assert.match(html, /Tokyo Fixture/)
    assert.match(html, /Frankfurt Fixture/)
    assert.match(html, /67 ms/)
    assert.match(html, /4\.2%/)
    assert.match(html, /bg-emerald-600\/90/)
    assert.match(html, /bg-rose-500\/80/)
    assert.doesNotMatch(html, /暂无节点/)
    assert.ok(rpcCalls.some(call => call.method === 'common:getRecords' && call.params?.type === 'ping' && call.params?.hours === 1 && !call.params?.uuid))
    if (process.env.SMOKE_SCREENSHOT_DIR)
      mkdirSync(process.env.SMOKE_SCREENSHOT_DIR, { recursive: true })
    await auditMobileFinanceOverflow(320)
    await auditMobileFinanceOverflow(390)
    await auditNodeFinanceStates(320)
    await auditNodeFinanceStates(390)
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
    await auditGlobeRegionInteraction()
    await auditGlobeRouteRipple()
    await auditGlobeMotionMode('earth', true)
    await auditGlobeMotionMode('earth-stop', false)
    await auditPingDialogCloseAnimation()
    await auditPingContentMotion()
    await auditMetricStoreFallback()
    await auditIntroDisabledReveal()
    await auditIntroGlobeHandoff()
    await auditMobileProbeMatrix()
    await auditVisitorCollapse()
    await auditVisitorReopen()
    await auditMobileChromeLayout()
    await auditMobileIntroTypography()
    await auditSearchGeometry(390)
    await auditSearchGeometry(1440)
    await auditMobileSearchMove()
    await auditEarlyIntroBeforeSlowNodes()
    await auditSlowPublicSettingsShell()

    const detailHtml = await dumpDom('detail', `/instance/${nodeUuid}`, 8000)
    assert.match(detailHtml, /资源与系统记录/)
    assert.match(detailHtml, /网络质量记录/)
    assert.match(detailHtml, /Tokyo route probe/)
    assert.ok(rpcCalls.some(call => call.method === 'common:getRecords' && call.params?.type === 'ping' && call.params?.uuid === nodeUuid))
    assert.ok(rpcCalls.some(call => call.method === 'public:queryMetrics'))
    if (usesModernKomariFixture) {
      assert.ok(rpcCalls.some(call => call.method === 'public:getPingMetricStats'))
      assert.ok(rpcCalls.some(call => call.method === 'public:getPublicPingTasks'))
    }

    console.log(`Komari ${fixtureKomariVersion} rendered-node and metric compatibility integration smoke test passed.`)

    const holdOpenMs = Number.parseInt(process.env.SMOKE_HOLD_OPEN_MS || '0', 10)
    if (Number.isFinite(holdOpenMs) && holdOpenMs > 0) {
      console.log(`[fixture] keeping production fixture open for ${holdOpenMs}ms`)
      await new Promise(resolveHold => setTimeout(resolveHold, holdOpenMs))
    }

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
}
