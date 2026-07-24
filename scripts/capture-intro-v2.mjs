// 首访 intro v2 交接动画取证脚本：
// 1. 截关键帧（地球出现、节点浮现、交接中间帧、交接完成、卡片浮现）；
// 2. 用 window.__lnlGlobeProbe 探针断言交接前后 phi/theta/画布中心/尺寸连续；
// 3. 回归跳过路径与 prefers-reduced-motion 路径。
// 用法：先 npm run build，再 node scripts/capture-intro-v2.mjs
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
const shotsDir = resolve(root, 'artifacts/audit-20260724/shots')
mkdirSync(shotsDir, { recursive: true })

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
    public_remark: 'intro v2 fixture',
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
    ping: {},
  }
}
const statuses = {
  [nodeUuid]: status(nodeUuid, 18),
  [secondNodeUuid]: status(secondNodeUuid, 24),
}
const historyRecords = Array.from({ length: 24 }, (_, index) => ({
  ...status(nodeUuid, 12 + index * 0.35),
  time: new Date(Date.parse('2026-07-20T08:00:00Z') - (23 - index) * 10 * 60_000).toISOString(),
}))
const pingRecords = Array.from({ length: 24 }, (_, index) => ({
  client: nodeUuid,
  task_id: 1,
  time: new Date(Date.parse('2026-07-20T08:00:00Z') - (23 - index) * 5 * 60_000).toISOString(),
  value: index === 8 ? -1 : 42 + (index % 6) * 5,
}))
const pingTasks = [{ id: 1, name: 'Tokyo route probe', interval: 300, loss: 4.17, min: 42, max: 67, avg: 54, latest: 67, total: pingRecords.length, type: 'icmp' }]

const mime = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
}
function json(response, payload) {
  response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}
const leadingSlashesPattern = /^\/+/
const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1')
  if (url.pathname === '/api/public') {
    json(response, {
      status: 'success',
      message: '',
      data: {
        sitename: 'LeoNetLab Fixture',
        description: 'intro v2 audit',
        private_site: false,
        record_enabled: true,
        theme: 'LeoNetLab',
        theme_settings: {
          rpcTransportMode: 'http',
          defaultThemeMode: 'system',
          earthViewMode: 'earth',
          visitorInfoCardEnabled: false,
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
      const results = {
        'rpc.ping': 'pong',
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
        json(response, { jsonrpc: '2.0', id: rpcRequest.id, error: { code: -32601, message: 'Method not found' } })
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
].filter(Boolean)
const browser = browserCandidates.find(existsSync)
assert.ok(browser, 'Chrome or Edge is required')

await new Promise((resolveListen, rejectListen) => {
  server.once('error', rejectListen)
  server.listen(0, '127.0.0.1', resolveListen)
})
const address = server.address()
assert.ok(address && typeof address === 'object')
const baseUrl = `http://127.0.0.1:${address.port}`
const profileRoot = resolve(tmpdir(), `leonetlab-intro-v2-${process.pid}`)

const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms))
const lineBreakPattern = /\r?\n/

async function openPage(name, width, height, initScript) {
  const profile = `${profileRoot}-${name}`
  const child = spawn(browser, [
    '--headless=new',
    '--disable-gpu',
    '--disable-features=SkiaGraphite',
    '--no-sandbox',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    'about:blank',
  ], { windowsHide: true })
  let socket
  const commandQueue = new Map()
  let commandId = 0
  try {
    const activePortFile = resolve(profile, 'DevToolsActivePort')
    const deadline = Date.now() + 10_000
    while (!existsSync(activePortFile) && Date.now() < deadline)
      await sleep(50)
    assert.ok(existsSync(activePortFile), 'Chrome DevTools port was not created')
    const [port] = readFileSync(activePortFile, 'utf8').trim().split(lineBreakPattern)
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json())
    const target = targets.find(item => item.type === 'page')
    assert.ok(target?.webSocketDebuggerUrl)
    socket = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolveOpen, rejectOpen) => {
      socket.addEventListener('open', resolveOpen, { once: true })
      socket.addEventListener('error', rejectOpen, { once: true })
    })
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data))
      const entry = commandQueue.get(message.id)
      if (!entry)
        return
      commandQueue.delete(message.id)
      if (message.error)
        entry.reject(new Error(message.error.message))
      else
        entry.resolve(message.result)
    })
    const command = (method, params = {}) => new Promise((resolveCommand, rejectCommand) => {
      const id = ++commandId
      commandQueue.set(id, { resolve: resolveCommand, reject: rejectCommand })
      socket.send(JSON.stringify({ id, method, params }))
    })
    await command('Page.enable')
    if (initScript)
      await command('Page.addScriptToEvaluateOnNewDocument', { source: initScript })
    await command('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width <= 760,
      screenWidth: width,
      screenHeight: height,
    })
    const evaluate = async (expression) => {
      const result = await command('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression })
      if (result.exceptionDetails)
        throw new Error(`page evaluation failed: ${JSON.stringify(result.exceptionDetails).slice(0, 400)}`)
      return result.result?.value
    }
    const screenshot = async (fileName) => {
      const shot = await command('Page.captureScreenshot', { format: 'png', fromSurface: true })
      const filePath = resolve(shotsDir, fileName)
      writeFileSync(filePath, Buffer.from(shot.data, 'base64'))
      return filePath
    }
    return {
      command,
      evaluate,
      screenshot,
      navigate: url => command('Page.navigate', { url }),
      close: async () => {
        socket?.close()
        if (child.exitCode === null) {
          const closed = new Promise(resolveClose => child.once('close', resolveClose))
          child.kill()
          await Promise.race([closed, sleep(3000)])
        }
        rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
      },
    }
  }
  catch (error) {
    socket?.close()
    if (child.exitCode === null)
      child.kill()
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    throw error
  }
}

const probeInitScript = `window.__lnlGlobeProbe = {};
window.__lnlErrors = [];
window.addEventListener('error', event => window.__lnlErrors.push(String(event.message || event.error)));
window.addEventListener('unhandledrejection', event => window.__lnlErrors.push('rejection:' + String(event.reason)));`

const probeSampleExpression = `(() => {
  const probe = window.__lnlGlobeProbe || {};
  const introEl = document.querySelector('.lnl-intro-globe');
  const introRect = introEl?.getBoundingClientRect();
  const dashEl = document.querySelector('.lnl-summary .node-earth-globe:not(.is-intro) canvas');
  const dashRect = dashEl?.getBoundingClientRect();
  return {
    t: performance.now(),
    intro: probe.intro || null,
    dashboard: probe.dashboard || null,
    handoff: probe.handoff || null,
    errors: window.__lnlErrors || [],
    introMounted: Boolean(document.querySelector('.lnl-intro')),
    handoffReady: Boolean(document.querySelector('.lnl-intro.is-handoff-ready')),
    leaving: Boolean(document.querySelector('.lnl-intro-exit-leave-active')),
    staged: Boolean(document.querySelector('.lnl-intro-staged')),
    introRect: introRect ? { left: introRect.left, top: introRect.top, width: introRect.width, height: introRect.height } : null,
    dashRect: dashRect ? { left: dashRect.left, top: dashRect.top, width: dashRect.width, height: dashRect.height } : null,
  };
})()`

const summary = { shots: [], runs: {} }

try {
  // ---------- Run 1: 完整首访时间线 + 关键帧截图 + 探针时间线 ----------
  {
    const page = await openPage('timeline', 1440, 900, probeInitScript)
    try {
      await page.navigate(`${baseUrl}/`)
      const timeline = []
      const sampleLoop = (async () => {
        for (let i = 0; i < 140; i += 1) {
          const sample = await page.evaluate(probeSampleExpression)
          timeline.push(sample)
          await sleep(75)
        }
      })()

      // 关键帧 1：地球旋转出现（globe-in 动画结束后）
      await page.evaluate(`new Promise((resolve) => {
        const deadline = Date.now() + 8000;
        const timer = setInterval(() => {
          const el = document.querySelector('.lnl-intro-globe');
          if (el && Number(getComputedStyle(el).opacity) > 0.95) {
            clearInterval(timer);
            resolve(true);
          } else if (Date.now() >= deadline) {
            clearInterval(timer);
            resolve(false);
          }
        }, 60);
      })`)
      summary.shots.push(await page.screenshot('intro-v2-01-globe-appears.png'))

      // 关键帧 2：节点标记模糊到清晰浮现（等标记聚焦动画完成）
      await sleep(1400)
      summary.shots.push(await page.screenshot('intro-v2-02-markers-focus.png'))

      // 关键帧 3：交接中间帧
      await page.evaluate(`new Promise((resolve) => {
        const deadline = Date.now() + 12000;
        const timer = setInterval(() => {
          if (document.querySelector('.lnl-intro-exit-leave-active')) {
            clearInterval(timer);
            resolve(true);
          } else if (Date.now() >= deadline) {
            clearInterval(timer);
            resolve(false);
          }
        }, 40);
      })`)
      await sleep(500)
      summary.shots.push(await page.screenshot('intro-v2-03-handoff-mid.png'))

      // 关键帧 4：交接完成瞬间（cover 即将移除，dashboard 地球接管）
      const lastIntroSample = await page.evaluate(`new Promise((resolve) => {
        const deadline = Date.now() + 6000;
        let last = null;
        const timer = setInterval(() => {
          const el = document.querySelector('.lnl-intro-globe');
          if (el)
            last = el.getBoundingClientRect().toJSON();
          if (!document.querySelector('.lnl-intro')) {
            clearInterval(timer);
            resolve(last);
          } else if (Date.now() >= deadline) {
            clearInterval(timer);
            resolve(last);
          }
        }, 30);
      })`)
      summary.shots.push(await page.screenshot('intro-v2-04-handoff-arrive.png'))

      // 关键帧 5：卡片自上而下浮现完成
      await sleep(1100)
      summary.shots.push(await page.screenshot('intro-v2-05-cards-revealed.png'))

      await sampleLoop
      const finalSample = timeline.at(-1)
      summary.runs.timeline = {
        finalSample,
        lastIntroSample,
        errors: finalSample?.errors ?? [],
        samples: timeline.filter((_, index) => index % 4 === 0),
      }

      // 探针断言：交接前后 phi/theta 连续，dashboard 从接管相位继续自转不回跳。
      assert.ok(finalSample?.intro, 'intro orientation probe missing')
      assert.ok(finalSample?.handoff, 'dashboard did not adopt the intro orientation')
      assert.ok(finalSample?.dashboard, 'dashboard orientation probe missing')
      const phiError = Math.abs(finalSample.handoff.phi - finalSample.intro.phi)
      const thetaError = Math.abs(finalSample.handoff.theta - finalSample.intro.theta)
      assert.ok(phiError < 0.01, `phi jumped across handoff: ${phiError}`)
      assert.ok(thetaError < 0.01, `theta jumped across handoff: ${thetaError}`)
      assert.ok(finalSample.dashboard.phi > finalSample.handoff.phi, `dashboard did not continue rotating from the handed-off phase: ${JSON.stringify(finalSample)}`)
      assert.equal(finalSample.errors.length, 0, `page errors during intro: ${JSON.stringify(finalSample.errors)}`)

      // 画布中心/尺寸连续：intro 最后一帧矩形与 dashboard 画布矩形对齐。
      assert.ok(lastIntroSample && finalSample.dashRect, 'missing canvas rects around the handoff')
      const centerErrorX = Math.abs((lastIntroSample.left + lastIntroSample.width / 2) - (finalSample.dashRect.left + finalSample.dashRect.width / 2))
      const centerErrorY = Math.abs((lastIntroSample.top + lastIntroSample.height / 2) - (finalSample.dashRect.top + finalSample.dashRect.height / 2))
      const widthError = Math.abs(lastIntroSample.width - finalSample.dashRect.width)
      assert.ok(centerErrorX < 28 && centerErrorY < 28, `canvas centers diverged: x=${centerErrorX} y=${centerErrorY}`)
      assert.ok(widthError < 28, `canvas widths diverged: ${widthError}`)
      summary.runs.timeline.assertions = { phiError, thetaError, centerErrorX, centerErrorY, widthError }

      // intro 在交接飞行期间必须持续渲染（旋转相位持续推进）
      const flightSamples = timeline.filter(sample => sample.leaving && sample.introMounted && sample.intro)
      const advancing = flightSamples.filter((sample, index) => index > 0 && sample.intro.t > flightSamples[index - 1].intro.t)
      summary.runs.timeline.flightFrames = { flightSamples: flightSamples.length, advancing: advancing.length }
      assert.ok(flightSamples.length === 0 || advancing.length >= Math.floor(flightSamples.length * 0.5), `intro globe stopped rendering mid-flight: ${JSON.stringify(flightSamples.slice(0, 6))}`)
    }
    finally {
      await page.close()
    }
  }

  // ---------- Run 2: 跳过按钮立即完成交接 ----------
  {
    const page = await openPage('skip', 1440, 900, probeInitScript)
    try {
      await page.navigate(`${baseUrl}/`)
      const skipMs = await page.evaluate(`new Promise((resolve) => {
        const deadline = Date.now() + 10000;
        const timer = setInterval(() => {
          const skip = document.querySelector('.lnl-intro-skip');
          if (skip) {
            clearInterval(timer);
            const started = performance.now();
            skip.click();
            const gone = setInterval(() => {
              if (!document.querySelector('.lnl-intro')) {
                clearInterval(gone);
                resolve(performance.now() - started);
              }
            }, 30);
            setTimeout(() => { clearInterval(gone); resolve(-1); }, 5000);
          } else if (Date.now() >= deadline) {
            clearInterval(timer);
            resolve(-2);
          }
        }, 60);
      })`)
      assert.ok(skipMs > 0 && skipMs <= 1600, `skip did not finish the handoff promptly: ${skipMs}ms`)
      await sleep(1000)
      summary.shots.push(await page.screenshot('intro-v2-06-skip-complete.png'))
      summary.runs.skip = { skipMs }
    }
    finally {
      await page.close()
    }
  }

  // ---------- Run 3: prefers-reduced-motion 静态路径 ----------
  {
    const page = await openPage('reduced', 1440, 900, probeInitScript)
    try {
      await page.command('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
      })
      await page.navigate(`${baseUrl}/`)
      await sleep(3500)
      const reduced = await page.evaluate(`(() => {
        const probe = window.__lnlGlobeProbe || {};
        const pingDot = document.querySelector('.node-card .animate-ping');
        const pulseDot = document.querySelector('.node-earth-globe:not(.is-intro) .animate-pulse');
        return {
          introShown: Boolean(document.querySelector('.lnl-intro')),
          staged: Boolean(document.querySelector('.lnl-intro-staged')),
          cards: document.querySelectorAll('.node-card').length,
          pingAnimation: pingDot ? getComputedStyle(pingDot).animationName : null,
          pulseAnimation: pulseDot ? getComputedStyle(pulseDot).animationName : null,
          dashboardPhi: probe.dashboard?.phi ?? null,
        };
      })()`)
      assert.equal(reduced.introShown, false, 'intro cover should not play under reduced-motion')
      assert.equal(reduced.staged, false, 'dashboard should not stay staged under reduced-motion')
      assert.ok(reduced.cards >= 2, 'node cards did not render under reduced-motion')
      assert.equal(reduced.pingAnimation, 'none', `animate-ping still runs under reduced-motion: ${reduced.pingAnimation}`)
      if (reduced.pulseAnimation !== null)
        assert.equal(reduced.pulseAnimation, 'none', `animate-pulse still runs under reduced-motion: ${reduced.pulseAnimation}`)
      assert.ok(reduced.dashboardPhi !== null, 'dashboard globe probe missing under reduced-motion')
      await sleep(900)
      const laterPhi = await page.evaluate(`(window.__lnlGlobeProbe || {}).dashboard?.phi ?? null`)
      assert.equal(laterPhi, reduced.dashboardPhi, `globe auto-rotated under reduced-motion: ${reduced.dashboardPhi} -> ${laterPhi}`)
      summary.shots.push(await page.screenshot('intro-v2-07-reduced-motion.png'))
      summary.runs.reducedMotion = reduced
    }
    finally {
      await page.close()
    }
  }

  writeFileSync(resolve(root, 'artifacts/audit-20260724/intro-v2-probe-summary.json'), JSON.stringify(summary, null, 2))
  console.log('intro v2 audit passed.')
  console.log(JSON.stringify({
    shots: summary.shots,
    timeline: summary.runs.timeline?.assertions,
    flightFrames: summary.runs.timeline?.flightFrames,
    skipMs: summary.runs.skip?.skipMs,
    reducedMotion: summary.runs.reducedMotion,
  }, null, 2))
}
finally {
  await new Promise(resolveClose => server.close(resolveClose))
  rmSync(profileRoot, { recursive: true, force: true })
}
