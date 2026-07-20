import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, resolve } from 'node:path'
import process from 'node:process'

const root = resolve(import.meta.dirname, '..')
const dist = resolve(root, 'dist')
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
    ping: {},
  }
}
const statuses = {
  [nodeUuid]: status(nodeUuid, 18),
  [secondNodeUuid]: status(secondNodeUuid, 24),
}
const leadingSlashesPattern = /^\/+/

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
          earthViewMode: 'hide',
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
        // This array is the exact collection shape used by Komari 1.2.5-fix1.
        'common:getNodes': clients,
        'common:getNodesLatestStatus': statuses,
        'common:getRecords': { count: 0, records: [], tasks: [] },
      }
      const result = results[rpcRequest.method]
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
  const file = resolve(dist, requested)
  if (!file.startsWith(`${dist}\\`) || !existsSync(file)) {
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

try {
  const html = await new Promise((resolveRun, rejectRun) => {
    const child = spawn(browser, [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${profile}`,
      '--virtual-time-budget=6000',
      '--dump-dom',
      `http://127.0.0.1:${address.port}/`,
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

  assert.match(html, /Tokyo Fixture/)
  assert.match(html, /Frankfurt Fixture/)
  assert.doesNotMatch(html, /暂无节点/)
  console.log('Komari 1.2.5 rendered-node integration smoke test passed.')
}
finally {
  await new Promise(resolveClose => server.close(resolveClose))
  rmSync(profile, { recursive: true, force: true })
}
