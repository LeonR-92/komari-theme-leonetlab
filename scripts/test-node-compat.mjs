import assert from 'node:assert/strict'
import { detectVisitorClient } from '../src/utils/clientDetection.ts'
import {
  calculateDailyCostCNY,
  calculateTotalDailyCostCNY,
  calculateTotalMonthlyAverageCostCNY,
  calculateTotalValueCNY,
  calculateValueCNY,
  DEFAULT_EXCHANGE_RATES,
  formatNodeMonthlyCost,
  formatNodeRecurringCost,
  formatRecurringCostTooltip,
} from '../src/utils/financeHelper.ts'
import { isMetricCapabilityUnavailable } from '../src/utils/metricCompatibility.ts'
import { normalizeUuidCollection } from '../src/utils/nodeResponse.ts'
import { normalizeNodeGpuSnapshot } from '../src/utils/nodeStatus.ts'
import {
  getLatencyToneClass,
  getLossToneClass,
  getPingTaskIdsWithSamples,
  summarizePingSamples,
} from '../src/utils/pingMetrics.ts'
import {
  bridgeShortDisplayGaps,
  cutPeakValues,
  fillMissingTimePoints,
  getAdaptiveHistoryDisplayIntervalSeconds,
  getHistoryDisplayIntervalSeconds,
  getSparsePointSymbolSize,
} from '../src/utils/recordHelper.ts'
import { normalizeRecordCollection, normalizeTimedRecordCollection } from '../src/utils/recordResponse.ts'

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

// Official 1.5.0-fix1, 1.5.1 and 1.6.0 share the node/status/record RPC sources.
// Additional server keys must remain optional at the normalization boundary.
for (const version of ['1.2.6', '1.3.2', '1.4.2', '1.4.3', '1.5.0', '1.5.0-fix1', '1.5.1', '1.6.0']) {
  assert.deepEqual(normalizeUuidCollection({ legacy_index: nodeA }), { 'node-a': nodeA }, version)
  assert.equal(normalizeNodeGpuSnapshot({ gpu: 18, gpu_average_usage: 0, gpu_count: 1 }).gpu, 0, `${version}: valid zero GPU average`)
}

assert.deepEqual(normalizeNodeGpuSnapshot({ gpu: 18 }), {
  gpu: 18,
  gpu_count: undefined,
  gpu_average_usage: undefined,
  gpu_detailed_info: undefined,
})
assert.deepEqual(normalizeNodeGpuSnapshot({
  gpu: 18,
  gpu_count: 1,
  gpu_average_usage: 42.5,
  gpu_detailed_info: [{ name: 'GPU 0', memory_total: 8_000, memory_used: 2_000, utilization: 42.5, temperature: 51 }],
}), {
  gpu: 42.5,
  gpu_count: 1,
  gpu_average_usage: 42.5,
  gpu_detailed_info: [{ name: 'GPU 0', memory_total: 8_000, memory_used: 2_000, utilization: 42.5, temperature: 51 }],
})
assert.deepEqual(normalizeNodeGpuSnapshot({
  gpu: 12,
  gpu_detailed_info: [{ name: 'invalid', memory_total: Number.NaN, memory_used: 0, utilization: 0, temperature: 0 }],
}), {
  gpu: 12,
  gpu_count: 0,
  gpu_average_usage: undefined,
  gpu_detailed_info: [],
})

assert.equal(isMetricCapabilityUnavailable({ code: -32601, message: 'Method not found' }), true)
assert.equal(isMetricCapabilityUnavailable({ code: -32603, message: 'metric store not initialized' }), true)
assert.equal(isMetricCapabilityUnavailable({ code: -32603, message: 'database timeout' }), false)
assert.equal(isMetricCapabilityUnavailable({ code: -32000, message: 'metric store not initialized' }), false)

assert.deepEqual(
  detectVisitorClient('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1', 5),
  { device: 'iPad', browser: 'Safari' },
)
assert.deepEqual(
  detectVisitorClient('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/120.0 Mobile/15E148 Safari/604.1', 5),
  { device: 'iPhone', browser: 'Chrome' },
)
assert.deepEqual(
  detectVisitorClient('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36', 5),
  { device: 'Android 手机', browser: 'Chrome' },
)
assert.deepEqual(
  detectVisitorClient('Mozilla/5.0 (Linux; Android 14; SM-X900) AppleWebKit/537.36 SamsungBrowser/25.0 Chrome/121.0 Safari/537.36', 5),
  { device: 'Android 平板', browser: 'Samsung Internet' },
)

const loadA = { client: 'node-a', time: '2026-07-20T00:00:00Z', cpu: 12 }
const loadB = { client: 'node-b', time: '2026-07-20T00:00:00Z', cpu: 18 }

// Both target releases group load history by UUID; retain flat-array support
// for compatible deployments and older exported fixtures.
assert.deepEqual(normalizeRecordCollection({ 'node-a': [loadA], 'node-b': [loadB] }, 'node-a'), [loadA])
assert.deepEqual(normalizeRecordCollection([loadA], 'node-a'), [loadA])
assert.deepEqual(normalizeRecordCollection(undefined, 'node-a'), [])

const nanoRecord = { client: 'node-a', time: '2026-07-20T00:02:00.123456789Z', cpu: 22 }
const duplicateRecord = { client: 'node-a', time: loadA.time, cpu: 13 }
const offsetDuplicateRecord = { client: 'node-a', time: '2026-07-20T08:00:00+08:00', cpu: 14 }
assert.deepEqual(normalizeTimedRecordCollection({ 'node-a': [nanoRecord, loadA, duplicateRecord] }, 'node-a'), [
  duplicateRecord,
  nanoRecord,
])
assert.deepEqual(normalizeTimedRecordCollection([loadA, offsetDuplicateRecord], 'node-a'), [offsetDuplicateRecord])
assert.deepEqual(normalizeTimedRecordCollection([
  { client: 'node-a', time: 'not-a-time', cpu: 1 },
  nanoRecord,
], 'node-a'), [nanoRecord])

assert.equal(getHistoryDisplayIntervalSeconds(4), 60)
assert.equal(getHistoryDisplayIntervalSeconds(24), 300)
assert.equal(getHistoryDisplayIntervalSeconds(168), 1800)
assert.equal(getHistoryDisplayIntervalSeconds(720), 7200)
assert.ok(720 * 3600 / getHistoryDisplayIntervalSeconds(720) <= 600)
assert.equal(getSparsePointSymbolSize([null, 20, null], 1), 5)
assert.equal(getSparsePointSymbolSize([10, 20, null], 1), 0)
assert.equal(getSparsePointSymbolSize([null, null, null], 1), 0)

const sparseThirtyDayRecords = fillMissingTimePoints([
  { time: '2026-07-01T00:00:00Z', cpu: 10 },
  { time: '2026-07-08T00:00:00Z', cpu: 20 },
  { time: '2026-07-15T00:00:00Z', cpu: 30 },
  { time: '2026-07-22T00:00:00Z', cpu: 40 },
  { time: '2026-07-29T00:00:00Z', cpu: 50 },
], getHistoryDisplayIntervalSeconds(720), 720 * 3600, getHistoryDisplayIntervalSeconds(720) * 0.6)
const sparseThirtyDayValues = sparseThirtyDayRecords.map(record => record.cpu)
assert.equal(sparseThirtyDayRecords.length, 361)
assert.equal(sparseThirtyDayValues.filter(value => value !== null).length, 5)
assert.equal(
  sparseThirtyDayValues.filter((value, index) => value !== null && getSparsePointSymbolSize(sparseThirtyDayValues, index) > 0).length,
  5,
)

const elevenHourRollups = [
  '2026-08-27T20:00:00Z',
  '2026-08-28T07:00:00Z',
  '2026-08-28T18:00:00Z',
  '2026-08-29T05:00:00Z',
  '2026-08-29T16:00:00Z',
  '2026-08-30T03:00:00Z',
  '2026-08-30T14:00:00Z',
].map((time, index) => ({ time, cpu: 10 + index }))
const adaptiveInterval = getAdaptiveHistoryDisplayIntervalSeconds(
  elevenHourRollups,
  getHistoryDisplayIntervalSeconds(72),
)
assert.equal(adaptiveInterval, 11 * 3600)
const adaptiveRows = fillMissingTimePoints(elevenHourRollups, adaptiveInterval, 72 * 3600, adaptiveInterval * 0.6)
const adaptiveValues = adaptiveRows.map(record => record.cpu)
assert.equal(adaptiveValues.filter(value => value !== null).length, elevenHourRollups.length)
assert.equal(adaptiveValues.slice(-elevenHourRollups.length).every(value => value !== null), true)
assert.equal(adaptiveRows.at(-1)?.time, '2026-08-30T14:00:00.000Z')

const ambiguousTwoPointInterval = getAdaptiveHistoryDisplayIntervalSeconds([
  { time: '2026-08-30T00:00:00.000Z' },
  { time: '2026-08-30T11:00:00.000Z' },
], 30 * 60)
assert.equal(ambiguousTwoPointInterval, 30 * 60, 'two distant samples must not be assumed to be a regular rollup cadence')

const rollupsWithLongGap = elevenHourRollups.filter((_record, index) => index < 3 || index > 4)
const longGapRows = fillMissingTimePoints(rollupsWithLongGap, adaptiveInterval, 72 * 3600, adaptiveInterval * 0.6)
assert.equal(longGapRows.some(record => record.cpu === null), true)

// Komari stores failed Ping samples as negative values. The status blocks must
// exclude them from latency while counting them in the loss percentage.
const mixedPingSummary = summarizePingSamples([100, 200, -1])
assert.equal(mixedPingSummary.latency, 150)
assert.ok(mixedPingSummary.loss !== null && Math.abs(mixedPingSummary.loss - 100 / 3) < 1e-10)
assert.equal(getLatencyToneClass(150), 'bg-lime-400/80')
assert.equal(getLossToneClass(0), 'bg-emerald-600/90')
assert.equal(getLatencyToneClass(201), 'bg-rose-500/80')
assert.equal(getLossToneClass(10), 'bg-rose-500/80')
assert.equal(getLatencyToneClass(60), 'bg-emerald-600/90')
assert.equal(getLatencyToneClass(61), 'bg-green-400/80')
assert.equal(getLatencyToneClass(100), 'bg-green-400/80')
assert.equal(getLatencyToneClass(101), 'bg-lime-400/80')
assert.equal(getLatencyToneClass(160), 'bg-lime-400/80')
assert.equal(getLatencyToneClass(161), 'bg-yellow-400/80')
assert.equal(getLatencyToneClass(200), 'bg-yellow-400/80')
assert.equal(getLossToneClass(1), 'bg-emerald-600/90')
assert.equal(getLossToneClass(1.1), 'bg-green-400/90')
assert.equal(getLossToneClass(3), 'bg-green-400/90')
assert.equal(getLossToneClass(3.1), 'bg-lime-400/90')
assert.equal(getLossToneClass(6), 'bg-lime-400/90')
assert.equal(getLossToneClass(6.1), 'bg-yellow-400/90')
assert.equal(getLossToneClass(9), 'bg-yellow-400/90')

// A task with only failed samples must remain visible and report 100% loss.
assert.deepEqual([...getPingTaskIdsWithSamples([
  { task_id: 7, value: -1 },
  { task_id: 7, value: -1 },
])], [7])
assert.deepEqual(summarizePingSamples([-1, -1]), { latency: null, loss: 100 })

// A source record can occupy at most one display slot even when the match
// tolerance is wider than the display interval.
const filledRecords = fillMissingTimePoints([
  { time: '2026-07-20T00:00:00Z', cpu: 10 },
  { time: '2026-07-20T00:02:00Z', cpu: 30 },
], 60, 180, 120)
assert.equal(filledRecords.length, 4)
assert.equal(filledRecords.filter(record => record.cpu === 10).length, 1)
assert.equal(filledRecords.filter(record => record.cpu === 30).length, 1)
assert.equal(filledRecords.filter(record => record.cpu === null).length, 2)

// Visual smoothing must not manufacture samples across a missing-data gap.
const smoothedRecords = cutPeakValues([
  { time: '2026-07-20T00:00:00Z', latency: 100 },
  { time: '2026-07-20T00:01:00Z', latency: null },
  { time: '2026-07-20T00:02:00Z', latency: 120 },
], ['latency'])
assert.equal(smoothedRecords[1].latency, null)
assert.equal(smoothedRecords[0].latency, 100)
assert.equal(smoothedRecords[2].latency, 120)

// A loss gap starts a new smoothing segment: its first valid point must not
// inherit the EWMA state or Hampel neighbors from before the disconnect.
const segmentedSmoothing = cutPeakValues([
  { time: '2026-07-20T00:00:00Z', latency: 20 },
  { time: '2026-07-20T00:01:00Z', latency: 22 },
  { time: '2026-07-20T00:02:00Z', latency: null },
  { time: '2026-07-20T00:03:00Z', latency: 180 },
  { time: '2026-07-20T00:04:00Z', latency: 182 },
], ['latency'])
assert.equal(segmentedSmoothing[2].latency, null)
assert.equal(segmentedSmoothing[3].latency, 180)

// The chart may visually bridge only one or two missing buckets. The helper
// must return a copy, preserve long disconnects, and never write into source data.
const oneBucketGap = [100, null, 120]
assert.deepEqual(bridgeShortDisplayGaps(oneBucketGap), [100, 110, 120])
assert.deepEqual(oneBucketGap, [100, null, 120])
assert.deepEqual(bridgeShortDisplayGaps([100, null, null, 130]), [100, 110, 120, 130])
assert.deepEqual(
  bridgeShortDisplayGaps([100, null, null, null, 140]),
  [100, null, null, null, 140],
)
assert.deepEqual(bridgeShortDisplayGaps([null, 100, 120, null]), [null, 100, 120, null])

const dailyCost = calculateTotalDailyCostCNY([
  { price: 30, billing_cycle: 30, currency: 'CNY', tags: '' },
  { price: 0, billing_cycle: 30, currency: 'CNY', tags: '' },
], DEFAULT_EXCHANGE_RATES)
assert.equal(dailyCost, 1)

const usdRates = { ...DEFAULT_EXCHANGE_RATES, USD: 0.14799 }
const usdNode = { price: 14.799, billing_cycle: 30, currency: 'USD', tags: '' }
assert.ok(Math.abs(calculateValueCNY(usdNode, usdRates) - 100) < 1e-8)
assert.equal(calculateValueCNY({ ...usdNode, currency: 'UNKNOWN' }, usdRates), 0)
assert.equal(calculateValueCNY(usdNode, { ...usdRates, USD: 0 }), 0)

const paidNode = { price: 30, billing_cycle: 30, currency: 'CNY', tags: 'production' }
const freeNode = { price: 300, billing_cycle: 30, currency: 'CNY', tags: 'edge; 白嫖 ;test' }
assert.equal(calculateTotalValueCNY([paidNode, freeNode], DEFAULT_EXCHANGE_RATES), 30)
assert.equal(calculateTotalMonthlyAverageCostCNY([paidNode, freeNode], DEFAULT_EXCHANGE_RATES), 30)
assert.equal(calculateValueCNY({ ...paidNode, expired_at: '2026-08-04T00:00:00Z' }, DEFAULT_EXCHANGE_RATES), 30)

assert.equal(calculateDailyCostCNY(paidNode, DEFAULT_EXCHANGE_RATES), 1)

assert.equal(formatNodeMonthlyCost({ price: -1, billing_cycle: 30, currency: 'CNY' }, 'CNY', DEFAULT_EXCHANGE_RATES).text, '免费')
assert.equal(formatNodeMonthlyCost({ price: 0, billing_cycle: 30, currency: 'CNY' }, 'CNY', DEFAULT_EXCHANGE_RATES).text, '未填写')
assert.equal(formatNodeMonthlyCost({ price: 36, billing_cycle: 30, currency: 'CNY' }, 'CNY', DEFAULT_EXCHANGE_RATES).text, '¥36.00')
assert.equal(formatNodeMonthlyCost({ price: 12, billing_cycle: 0, currency: 'CNY' }, 'CNY', DEFAULT_EXCHANGE_RATES).text, '—')
assert.equal(formatNodeMonthlyCost({ price: 30, billing_cycle: 30, currency: 'UNKNOWN' }, 'CNY', DEFAULT_EXCHANGE_RATES).text, 'UNKNOWN 30.00')
assert.equal(formatNodeMonthlyCost({ price: 14.799, billing_cycle: 30, currency: 'USD' }, 'CNY', usdRates, true).text, '$14.80')
assert.equal(formatNodeMonthlyCost({ price: 14.799, billing_cycle: 30, currency: 'USD' }, 'CNY', usdRates, true).referenceText, '¥100.00 CNY')
assert.equal(formatNodeMonthlyCost({ price: 14.799, billing_cycle: 30, currency: 'USD' }, 'CNY', usdRates, false).text, '$14.80')
assert.equal(formatNodeRecurringCost({ price: 36, billing_cycle: 30, currency: 'CNY' }, 'CNY', DEFAULT_EXCHANGE_RATES, 'quarterly').text, '¥108')
assert.equal(formatNodeRecurringCost({ price: 36, billing_cycle: 30, currency: 'CNY' }, 'CNY', DEFAULT_EXCHANGE_RATES, 'yearly').text, '¥432')

const annualUsdNode = { price: 119, billing_cycle: 365, currency: 'USD' }
const annualUsdMonthly = formatNodeRecurringCost(annualUsdNode, 'CNY', usdRates, 'monthly', true)
const annualUsdQuarterly = formatNodeRecurringCost(annualUsdNode, 'CNY', usdRates, 'quarterly', true)
const annualUsdYearly = formatNodeRecurringCost(annualUsdNode, 'CNY', usdRates, 'yearly', true)
assert.equal(annualUsdMonthly.text, '$9.92')
assert.equal(annualUsdQuarterly.text, '$29.75')
assert.equal(annualUsdYearly.text, '$119')
assert.equal(annualUsdYearly.amount, 119)
assert.equal(annualUsdYearly.derived, false)
assert.equal(annualUsdYearly.referenceText, '¥804.1084 CNY')
assert.match(formatRecurringCostTooltip(annualUsdYearly, 'yearly'), /后台原值 119\.00 USD \/ 年（365 天）/)
assert.equal(formatNodeRecurringCost({ price: 60, billing_cycle: 180, currency: 'USD' }, 'USD', usdRates, 'monthly').text, '$10.00')
assert.equal(formatNodeRecurringCost({ price: 240, billing_cycle: 730, currency: 'USD' }, 'USD', usdRates, 'yearly').text, '$120')
const customCycle = formatNodeRecurringCost({ price: 100, billing_cycle: 100, currency: 'USD' }, 'USD', usdRates, 'quarterly')
assert.equal(customCycle.text, '$90.00')
assert.equal(customCycle.estimated, true)
assert.match(formatRecurringCostTooltip(customCycle, 'quarterly'), /按自定义天数估算/)
const oneTime = formatNodeRecurringCost({ price: 499, billing_cycle: -1, currency: 'USD' }, 'USD', usdRates, 'yearly')
assert.equal(oneTime.text, '$499')
assert.equal(oneTime.oneTime, true)
assert.match(formatRecurringCostTooltip(oneTime, 'yearly'), /^一次性 499\.00 USD · 后台原值/)

console.log('Komari 1.2.5-fix1 through 1.6.0 node, GPU, record, and Ping metric compatibility passed.')
