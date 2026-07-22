import assert from 'node:assert/strict'
import { calculateTotalDailyCostCNY, DEFAULT_EXCHANGE_RATES } from '../src/utils/financeHelper.ts'
import { normalizeUuidCollection } from '../src/utils/nodeResponse.ts'
import { getLatencyToneClass, getLossToneClass, summarizePingSamples } from '../src/utils/pingMetrics.ts'
import { normalizeRecordCollection } from '../src/utils/recordResponse.ts'

const nodeA = { uuid: 'node-a', name: 'Tokyo' }
const nodeB = { uuid: 'node-b', name: 'Frankfurt' }

// Komari 1.2.5-fix1: common:getNodes returns Client[].
assert.deepEqual(normalizeUuidCollection([nodeA, nodeB]), {
  'node-a': nodeA,
  'node-b': nodeB,
})

// Komari 1.2.5-fix2 and 1.2.7: common:getNodes returns a UUID-keyed object.
assert.deepEqual(normalizeUuidCollection({ 'node-a': nodeA, 'node-b': nodeB }), {
  'node-a': nodeA,
  'node-b': nodeB,
})

// Canonicalize by each node's own UUID instead of trusting transport keys.
assert.deepEqual(normalizeUuidCollection({ legacy_index: nodeA }), {
  'node-a': nodeA,
})

assert.deepEqual(normalizeUuidCollection(undefined), {})

const loadA = { client: 'node-a', time: '2026-07-20T00:00:00Z', cpu: 12 }
const loadB = { client: 'node-b', time: '2026-07-20T00:00:00Z', cpu: 18 }

// Both target releases group load history by UUID; retain flat-array support
// for compatible deployments and older exported fixtures.
assert.deepEqual(normalizeRecordCollection({ 'node-a': [loadA], 'node-b': [loadB] }, 'node-a'), [loadA])
assert.deepEqual(normalizeRecordCollection([loadA], 'node-a'), [loadA])
assert.deepEqual(normalizeRecordCollection(undefined, 'node-a'), [])

// Komari stores failed Ping samples as negative values. The status blocks must
// exclude them from latency while counting them in the loss percentage.
const mixedPingSummary = summarizePingSamples([100, 200, -1])
assert.equal(mixedPingSummary.latency, 150)
assert.ok(mixedPingSummary.loss !== null && Math.abs(mixedPingSummary.loss - 100 / 3) < 1e-10)
assert.equal(getLatencyToneClass(150), 'bg-lime-400/80')
assert.equal(getLossToneClass(0), 'bg-emerald-600/90')
assert.equal(getLatencyToneClass(201), 'bg-rose-500/80')
assert.equal(getLossToneClass(10), 'bg-rose-500/80')

const dailyCost = calculateTotalDailyCostCNY([
  { price: 30, billing_cycle: 30, currency: 'CNY', tags: '' },
  { price: 0, billing_cycle: 30, currency: 'CNY', tags: '' },
], DEFAULT_EXCHANGE_RATES)
assert.equal(dailyCost, 1)

console.log('Komari 1.2.5-fix1/1.2.5-fix2/1.2.7 node, record, and Ping metric compatibility passed.')
