export interface PingSampleSummary {
  latency: number | null
  loss: number | null
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

export function getLatencyToneClass(latency: number): string {
  if (latency <= 60)
    return 'bg-emerald-500'
  if (latency <= 100)
    return 'bg-green-400'
  if (latency <= 160)
    return 'bg-lime-400'
  if (latency <= 200)
    return 'bg-yellow-400'
  return 'bg-rose-500'
}

export function getLossToneClass(loss: number): string {
  if (loss <= 1)
    return 'bg-emerald-500'
  if (loss <= 3)
    return 'bg-green-400'
  if (loss <= 6)
    return 'bg-lime-400'
  if (loss <= 9)
    return 'bg-yellow-400'
  return 'bg-rose-500'
}
