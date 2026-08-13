const METRIC_STORE_UNAVAILABLE_PATTERN = /metric store\s+(?:is\s+)?not initialized/i

interface RpcCompatibilityError {
  code: number
  message: string
}

/** Only explicit method absence and the official uninitialized-store error downgrade. */
export function isMetricCapabilityUnavailable(error: unknown): boolean {
  if (!error || typeof error !== 'object')
    return false

  const candidate = error as Partial<RpcCompatibilityError>
  if (candidate.code === -32601)
    return true
  return candidate.code === -32603
    && typeof candidate.message === 'string'
    && METRIC_STORE_UNAVAILABLE_PATTERN.test(candidate.message)
}
