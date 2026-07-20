import assert from 'node:assert/strict'
import { normalizeUuidCollection } from '../src/utils/nodeResponse.ts'
import { normalizeRecordCollection } from '../src/utils/recordResponse.ts'

const nodeA = { uuid: 'node-a', name: 'Tokyo' }
const nodeB = { uuid: 'node-b', name: 'Frankfurt' }

// Komari 1.2.5-fix1: common:getNodes returns Client[].
assert.deepEqual(normalizeUuidCollection([nodeA, nodeB]), {
  'node-a': nodeA,
  'node-b': nodeB,
})

// Komari 1.2.7: common:getNodes returns a UUID-keyed object.
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

console.log('Komari 1.2.5/1.2.7 node and record response compatibility passed.')
