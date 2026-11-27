export interface PingSampleSummary {
  latency: number | null
  loss: number | null
}

export interface PingTaskSample {
  task_id: number
  value: number
}

export function summarizePingSamples(values: number[]): PingSampleSummary {
  if (!values.length)
    return { latency: null, loss: null }

  const validValues = values.filter(value => Number.isFinite(value) && value >= 0)
  const latency = validValues.length
    ? validValues.reduce((sum, value) => sum + value, 0) / validValues.length
    : null

  return {
    latency,
    loss: (values.length - validValues.length) / values.length * 100,
  }
}

export function getPingTaskIdsWithSamples(records: PingTaskSample[]): Set<number> {
  return new Set(
    records
      .filter(record => Number.isInteger(record.task_id) && Number.isFinite(record.value))
      .map(record => record.task_id),
  )
}

export function normalizePingLossPercent(rawLoss: number): number {
  if (!Number.isFinite(rawLoss) || rawLoss <= 0)
    return 0
  return rawLoss > 1 ? Math.min(100, rawLoss) : Math.min(100, rawLoss * 100)
}

/**
 * Derive the real timeline step (ms) from server rollup `interval_seconds` or per-task
 * observed sample intervals, preventing multi-day downsampled points from turning into
 * alternating nulls between isolated gaps.
 */
export function resolvePingTimelineCadenceMs(
  records: ReadonlyArray<{ task_id: number, time: string }>,
  options: {
    hours: number
    serverIntervalSec?: number | null
    taskIntervalsSec?: ReadonlyArray<number>
  },
): number {
  const windowMs = Math.max(1, options.hours) * 3600_000
  const maxStepMs = Math.max(60_000, Math.floor(windowMs / 4))
  const positiveTaskIntervals = (options.taskIntervalsSec ?? []).filter(sec => Number.isFinite(sec) && sec > 0)
  const rawMinTaskMs = positiveTaskIntervals.length
    ? Math.max(30_000, Math.min(...positiveTaskIntervals) * 1000)
    : options.hours <= 1 ? 60_000 : options.hours <= 6 ? 120_000 : 300_000

  const serverIntervalMs = typeof options.serverIntervalSec === 'number' && Number.isFinite(options.serverIntervalSec) && options.serverIntervalSec > 0
    ? Math.round(options.serverIntervalSec * 1000)
    : 0

  const timestampsByTask = new Map<number, number[]>()
  for (const record of records) {
    const ts = Date.parse(record.time)
    if (!Number.isFinite(ts))
      continue
    const list = timestampsByTask.get(record.task_id) ?? []
    list.push(ts)
    timestampsByTask.set(record.task_id, list)
  }

  const taskCadences: number[] = []
  for (const list of timestampsByTask.values()) {
    list.sort((a, b) => a - b)
    const deltas: number[] = []
    for (let i = 1; i < list.length; i++) {
      const delta = list[i]! - list[i - 1]!
      if (delta >= 5_000)
        deltas.push(delta)
    }
    if (deltas.length < 2)
      continue
    deltas.sort((a, b) => a - b)
    // Lower-median (~P45) cadence tracks the steady rollup step even if some outages exist.
    const index = deltas.length === 2 ? 0 : Math.floor((deltas.length - 1) * 0.45)
    const candidate = deltas[index]
    if (candidate !== undefined && Number.isFinite(candidate))
      taskCadences.push(candidate)
  }

  const observedMs = taskCadences.length ? Math.min(...taskCadences) : 0
  const fallbackFloorMs = Math.max(rawMinTaskMs, Math.ceil(windowMs / 500))
  const resolved = observedMs > 0
    ? Math.max(observedMs, serverIntervalMs, 10_000)
    : Math.max(serverIntervalMs, fallbackFloorMs)

  return Math.min(maxStepMs, Math.max(10_000, resolved))
}

/**
 * Compute timestamp merge tolerance (ms) proportional to the resolved Ping cadence
 * so multi-probe samples rounded or staggered across multi-day buckets still align on one row.
 */
export function resolvePingMergeToleranceMs(
  cadenceMs: number,
  taskIntervalsSec?: ReadonlyArray<number>,
): number {
  const positiveIntervals = (taskIntervalsSec ?? []).filter(sec => Number.isFinite(sec) && sec > 0)
  const fallbackMs = positiveIntervals.length ? Math.min(...positiveIntervals) * 1000 : 60_000
  const baseMs = Number.isFinite(cadenceMs) && cadenceMs > 0 ? cadenceMs : fallbackMs
  if (baseMs <= 60_000)
    return Math.min(18_000, Math.max(800, Math.floor(baseMs * 0.3)))
  return Math.max(6_000, Math.floor(baseMs * 0.4))
}

export function getLatencyToneClass(latency: number): string {
  if (latency <= 60)
    return 'bg-emerald-600/90'
  if (latency <= 100)
    return 'bg-green-400/80'
  if (latency <= 160)
    return 'bg-lime-400/80'
  if (latency <= 200)
    return 'bg-yellow-400/80'
  return 'bg-rose-500/80'
}

export function getLossToneClass(loss: number): string {
  if (loss <= 1)
    return 'bg-emerald-600/90'
  if (loss <= 3)
    return 'bg-green-400/90'
  if (loss <= 6)
    return 'bg-lime-400/90'
  if (loss <= 9)
    return 'bg-yellow-400/90'
  return 'bg-rose-500/80'
}
