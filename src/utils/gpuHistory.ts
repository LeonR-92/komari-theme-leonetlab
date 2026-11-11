export const GPU_HISTORY_FALLBACK_MAX_HOURS = 4

/** The public records RPC returns raw data and does not accept maxCount. */
export function publicGpuHistoryParams(uuid: string, hours: number) {
  const boundedHours = Number.isFinite(hours) ? Math.max(1, Math.min(GPU_HISTORY_FALLBACK_MAX_HOURS, Math.floor(hours))) : 1
  return { uuid, hours: String(boundedHours), load_type: 'all' }
}

export function alignGpuHistorySeries(series: ReadonlyArray<{ points: ReadonlyArray<{ time: string, value: number | null }> }>) {
  const times = new Set<number>()
  const indexed = series.map(({ points }) => {
    const values = new Map<number, number | null>()
    for (const point of points) {
      const time = Date.parse(point.time)
      if (!Number.isFinite(time))
        continue
      times.add(time)
      const value = typeof point.value === 'number' && Number.isFinite(point.value) ? point.value : null
      if (value !== null || !values.has(time))
        values.set(time, value)
    }
    return values
  })
  const timestamps = [...times].sort((a, b) => a - b)
  return { timestamps, valuesBySeries: indexed.map(values => timestamps.map(time => values.get(time) ?? null)) }
}
