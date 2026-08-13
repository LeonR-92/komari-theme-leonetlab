import type { KomariRpc, MetricDefinition } from '@/utils/rpc'
import { isMetricCapabilityUnavailable } from '@/utils/metricCompatibility'
import { getSharedRpc } from '@/utils/rpc'

export { isMetricCapabilityUnavailable } from '@/utils/metricCompatibility'

let definitionsRequest: Promise<MetricDefinition[]> | null = null

/** Fetch once per application session; unsupported repositories resolve as no capability. */
export function listAvailableMetricDefinitions(rpc: KomariRpc = getSharedRpc()): Promise<MetricDefinition[]> {
  if (definitionsRequest)
    return definitionsRequest

  definitionsRequest = rpc.listMetricDefinitions()
    .then(definitions => Array.isArray(definitions) ? definitions : [])
    .catch((error) => {
      if (isMetricCapabilityUnavailable(error))
        return []
      definitionsRequest = null
      throw error
    })

  return definitionsRequest
}

export function resetMetricDefinitionsForTests(): void {
  definitionsRequest = null
}
