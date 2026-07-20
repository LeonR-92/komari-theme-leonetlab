import assert from 'node:assert/strict'
import { normalizeUuidCollection } from '../src/utils/nodeResponse.ts'

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

console.log('Komari 1.2.5/1.2.7 node-response compatibility passed.')
