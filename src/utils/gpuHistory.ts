export const GPU_HISTORY_FALLBACK_MAX_HOURS = 4

export interface AlignGpuHistoryOptions {
  /** Cluster timestamps within this tolerance (ms) into the same aligned slot. Default 5000ms. */
  toleranceMs?: number
  /** Uniform time grid interval (seconds). When set, gaps receive null slots like base charts. */
  intervalSec?: number
  /** Rolling window duration (seconds) anchored at effective end timestamp. */
  totalSeconds?: number
  /** Optional explicit right-edge timestamp (e.g., Date.now() when node is offline). */
  endTimeMs?: number
}

/** The public records RPC returns raw data and does not accept maxCount. */
export function publicGpuHistoryParams(uuid: string, hours: number) {
  const boundedHours = Number.isFinite(hours) ? Math.max(1, Math.min(GPU_HISTORY_FALLBACK_MAX_HOURS, Math.floor(hours))) : 1
  return { uuid, hours: String(boundedHours), load_type: 'all' }
}

/**
 * Align multiple GPU history series onto one sorted, tolerance-clustered timeline.
 * Optionally projects samples onto a uniform time grid (`intervalSec`) so outages
 * leave genuine null gaps instead of skipping offline durations.
 */
export function alignGpuHistorySeries(
  series: ReadonlyArray<{ points: ReadonlyArray<{ time: string, value: number | null }> }>,
  options: AlignGpuHistoryOptions = {},
) {
  const toleranceMs = Math.max(0, options.toleranceMs ?? 5_000)

  const parsedBySeries = series.map(({ points }) => {
    const valid: Array<{ time: number, value: number | null }> = []
    for (const point of points) {
      const time = Date.parse(point.time)
      if (!Number.isFinite(time))
        continue
      const value = typeof point.value === 'number' && Number.isFinite(point.value) ? point.value : null
      valid.push({ time, value })
    }
    valid.sort((a, b) => a.time - b.time)
    return valid
  })

  const allTimes = parsedBySeries
    .flatMap(items => items.map(item => item.time))
    .sort((a, b) => a - b)

  if (allTimes.length === 0)
    return { timestamps: [], valuesBySeries: series.map(() => []) }

  // Uniform time grid mode (matches base resource charts' outage representation)
  if (typeof options.intervalSec === 'number' && Number.isFinite(options.intervalSec) && options.intervalSec > 0) {
    const intervalMs = Math.max(1_000, Math.round(options.intervalSec * 1_000))
    const firstDataTime = allTimes[0]!
    const lastDataTime = allTimes.at(-1)!
    const end = typeof options.endTimeMs === 'number' && Number.isFinite(options.endTimeMs) && options.endTimeMs > lastDataTime
      ? options.endTimeMs
      : lastDataTime
    const totalMs = typeof options.totalSeconds === 'number' && Number.isFinite(options.totalSeconds) && options.totalSeconds > 0
      ? options.totalSeconds * 1_000
      : null
    const start = totalMs !== null
      ? end - Math.ceil(totalMs / intervalMs) * intervalMs
      : firstDataTime

    const timestamps: number[] = []
    for (let t = start; t <= end; t += intervalMs)
      timestamps.push(t)

    const matchTolerance = Math.max(toleranceMs, intervalMs * 0.6)
    const valuesBySeries = parsedBySeries.map((points) => {
      const slots = new Map<number, { value: number | null, distance: number }>()
      for (const point of points) {
        const slotIndex = Math.round((point.time - start) / intervalMs)
        if (slotIndex < 0 || slotIndex >= timestamps.length)
          continue
        const slotTime = timestamps[slotIndex]
        if (slotTime === undefined)
          continue
        const distance = Math.abs(point.time - slotTime)
        if (distance > matchTolerance)
          continue
        const existing = slots.get(slotIndex)
        if (!existing || (point.value !== null && (existing.value === null || distance < existing.distance)) || (existing.value === null && point.value === null && distance < existing.distance))
          slots.set(slotIndex, { value: point.value, distance })
      }
      return timestamps.map((_, index) => slots.get(index)?.value ?? null)
    })

    return { timestamps, valuesBySeries }
  }

  // Anchor clustering mode: groups staggered multi-device timestamps within toleranceMs
  const anchors: number[] = []
  for (const time of allTimes) {
    const lastAnchor = anchors.at(-1)
    if (lastAnchor === undefined || time - lastAnchor > toleranceMs)
      anchors.push(time)
  }

  const valuesBySeries = parsedBySeries.map((points) => {
    const slotValues = Array.from<number | null>({ length: anchors.length }).fill(null)
    const slotDistances = Array.from<number>({ length: anchors.length }).fill(Number.POSITIVE_INFINITY)
    let anchorCursor = 0
    for (const point of points) {
      while (anchorCursor + 1 < anchors.length && Math.abs(anchors[anchorCursor + 1]! - point.time) <= Math.abs(anchors[anchorCursor]! - point.time))
        anchorCursor += 1
      const distance = Math.abs(anchors[anchorCursor]! - point.time)
      if (distance > toleranceMs)
        continue
      const prevValue = slotValues[anchorCursor]
      const prevDist = slotDistances[anchorCursor]!
      if (point.value !== null && (prevValue === null || distance < prevDist)) {
        slotValues[anchorCursor] = point.value
        slotDistances[anchorCursor] = distance
      }
    }
    return slotValues
  })

  return { timestamps: anchors, valuesBySeries }
}
