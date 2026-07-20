import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = path => readFileSync(resolve(root, path), 'utf8')
const manifest = JSON.parse(read('komari-theme.json'))
const config = manifest.configuration?.data

assert.equal(typeof manifest.name, 'string')
assert.match(manifest.short, /^[\w-]+$/)
assert.notEqual(manifest.short, 'default')
assert.equal(manifest.version, '1.0.1')
assert.equal(manifest.configuration?.type, 'managed')
assert.ok(Array.isArray(config), 'managed configuration.data must be an array')

const keys = config.filter(item => item.type !== 'title').map(item => item.key)
assert.equal(new Set(keys).size, keys.length, 'theme setting keys must be unique')
for (const item of config) {
  assert.ok(['title', 'string', 'number', 'select', 'switch', 'richtext'].includes(item.type), `unsupported config type: ${item.type}`)
  if (item.type !== 'title')
    assert.equal(typeof item.key, 'string')
  if (item.type === 'select')
    assert.equal(typeof item.options, 'string')
}

assert.ok(existsSync(resolve(root, 'dist/index.html')), 'dist/index.html is missing; run the build first')
const distIndex = read('dist/index.html')
assert.match(distIndex, /<title>Komari Monitor<\/title>/)
assert.match(distIndex, /<meta name="description" content="A simple server monitor tool\."/)

const rpc = read('src/utils/rpc.ts')
const init = read('src/utils/init.ts')
const pingChart = read('src/components/PingChart.vue')
const nodeResponse = read('src/utils/nodeResponse.ts')
for (const method of ['common:getNodes', 'common:getNodesLatestStatus', 'common:getRecords'])
  assert.ok(`${rpc}\n${init}\n${pingChart}`.includes(method), `missing RPC compatibility method: ${method}`)
assert.match(pingChart, /public:queryMetrics/)
assert.match(pingChart, /isMethodNotFoundError/)
assert.match(pingChart, /fetchLegacyRecords/)
assert.match(rpc, /normalizeUuidCollection/)
assert.match(nodeResponse, /Array\.isArray\(collection\)/)
assert.match(nodeResponse, /normalized\[uuid\] = item/)

const loadingCover = read('src/components/LoadingCover.vue')
assert.match(loadingCover, /--lnl-intro-globe/)
assert.match(loadingCover, /--lnl-intro-title/)
assert.match(loadingCover, /prefers-reduced-motion/)

console.log('LeoNetLab theme validation passed.')
