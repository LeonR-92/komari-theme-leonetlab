import type { GPUDeviceInfo, NodeStatus } from './rpc'

export interface NormalizedGpuSnapshot {
  gpu: number
  gpu_count?: number
  gpu_average_usage?: number
  gpu_detailed_info?: GPUDeviceInfo[]
}

/** Normalize additive Komari 1.5 GPU fields without changing older status semantics. */
export function normalizeNodeGpuSnapshot(status: Pick<NodeStatus, 'gpu' | 'gpu_count' | 'gpu_average_usage' | 'gpu_detailed_info'>): NormalizedGpuSnapshot {
  const hasAverage = typeof status.gpu_average_usage === 'number' && Number.isFinite(status.gpu_average_usage)
  const fallbackGpu = typeof status.gpu === 'number' && Number.isFinite(status.gpu) ? status.gpu : 0
  const details = Array.isArray(status.gpu_detailed_info)
    ? status.gpu_detailed_info
        .filter(device => device
          && typeof device.name === 'string'
          && Number.isFinite(device.memory_total)
          && Number.isFinite(device.memory_used)
          && Number.isFinite(device.utilization)
          && Number.isFinite(device.temperature))
        .map(device => ({ ...device }))
    : undefined
  const count = typeof status.gpu_count === 'number' && Number.isFinite(status.gpu_count)
    ? Math.max(0, Math.trunc(status.gpu_count))
    : details?.length

  return {
    gpu: hasAverage ? status.gpu_average_usage! : fallbackGpu,
    gpu_count: count,
    gpu_average_usage: hasAverage ? status.gpu_average_usage : undefined,
    gpu_detailed_info: details,
  }
}
