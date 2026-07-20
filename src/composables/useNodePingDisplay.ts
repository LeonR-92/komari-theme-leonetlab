import type { MaybeRefOrGetter } from 'vue'
import type { NodeStatusPing } from '@/utils/rpc'
import { computed, toValue } from 'vue'
import { NODE_PING_BAR_COUNT, useNodePingStats } from '@/composables/useNodePingStats'
import { formatDateTime } from '@/utils/helper'
import { getLatencyToneClass, getLossToneClass } from '@/utils/pingMetrics'

export type NodePingMetric = 'latency' | 'loss'

// Card summaries use the latest hour so all nodes share one bounded request.
const RECENT_PING_RECORDS_QUERY_HOURS = 1

export interface NodePingBar {
  key: string
  className: string
  tooltip: string
}

interface UseNodePingDisplayOptions {
  enabled?: MaybeRefOrGetter<boolean>
  latestPing?: MaybeRefOrGetter<Record<string, NodeStatusPing> | undefined>
  loadingDisplayText?: string
  emptyDisplayText?: string
  loadingPanelTooltipText?: Partial<Record<NodePingMetric, string>>
  emptyPanelTooltipText?: Partial<Record<NodePingMetric, string>>
}

export function useNodePingDisplay(
  uuid: MaybeRefOrGetter<string>,
  options: UseNodePingDisplayOptions = {},
) {
  // Komari 1.2.6+ uses metric-store retention and keeps the legacy public
  // record fields for compatibility only. They can report records as disabled
  // even when ping metrics are available, so only an explicit caller option
  // should prevent the query.
  const pingStatsEnabled = computed(() => options.enabled === undefined || toValue(options.enabled))

  const pingRecordsQueryHours = computed(() => RECENT_PING_RECORDS_QUERY_HOURS)

  const pingStats = useNodePingStats(uuid, {
    hours: pingRecordsQueryHours,
    enabled: pingStatsEnabled,
  })

  const latestPingEntries = computed(() => Object.entries(
    options.latestPing === undefined ? {} : (toValue(options.latestPing) ?? {}),
  ))
  const latestLatencyValues = computed(() => latestPingEntries.value
    .map(([, task]) => task.latest)
    .filter(value => Number.isFinite(value) && value >= 0))
  const latestLossValues = computed(() => latestPingEntries.value
    .map(([, task]) => task.loss)
    .filter(Number.isFinite))
  const latestLatencyAverage = computed(() => latestLatencyValues.value.length
    ? latestLatencyValues.value.reduce((sum, value) => sum + value, 0) / latestLatencyValues.value.length
    : null)
  const latestLossAverage = computed(() => latestLossValues.value.length
    ? latestLossValues.value.reduce((sum, value) => sum + value, 0) / latestLossValues.value.length
    : null)

  function buildPingBars(metric: NodePingMetric): NodePingBar[] {
    const points = pingStats.history.value
    if (!points.length)
      return []

    return points.map((point, index) => {
      const value = point[metric]

      return {
        key: `${point.time}-${index}`,
        className: value === null
          ? 'bg-muted-foreground/15'
          : metric === 'latency'
            ? getLatencyToneClass(value)
            : getLossToneClass(value),
        tooltip: value === null
          ? `${formatDateTime(point.time, 'HH:mm:ss')} N/A`
          : metric === 'latency'
            ? `${formatDateTime(point.time, 'HH:mm:ss')}\n${Math.round(value)} ms`
            : `${formatDateTime(point.time, 'HH:mm:ss')}\n${value.toFixed(1)}%`,
      }
    })
  }

  function buildEmptyPingBars(metric: NodePingMetric): NodePingBar[] {
    const tooltip = pingStats.loading.value
      ? '加载中'
      : pingStats.error.value
        ? '加载失败'
        : !pingStatsEnabled.value
            ? '未启用记录'
            : metric === 'latency'
              ? 'N/A'
              : 'N/A'

    return Array.from({ length: NODE_PING_BAR_COUNT }, (_, index) => ({
      key: `${metric}-empty-${index}`,
      className: 'bg-muted-foreground/10',
      tooltip,
    }))
  }

  function buildLatestPingBars(metric: NodePingMetric): NodePingBar[] {
    return latestPingEntries.value.slice(0, NODE_PING_BAR_COUNT).map(([taskId, task]) => {
      const value = metric === 'latency' ? task.latest : task.loss
      const unavailable = !Number.isFinite(value) || (metric === 'latency' && value < 0)

      return {
        key: `${metric}-latest-${taskId}`,
        className: unavailable
          ? 'bg-muted-foreground/15'
          : metric === 'latency'
            ? getLatencyToneClass(value)
            : getLossToneClass(value),
        tooltip: unavailable
          ? `${task.name || `Ping ${taskId}`} N/A`
          : metric === 'latency'
            ? `${task.name || `Ping ${taskId}`}\n${Math.round(value)} ms`
            : `${task.name || `Ping ${taskId}`}\n${value.toFixed(1)}%`,
      }
    })
  }

  const latencyBars = computed(() => buildPingBars('latency'))
  const lossBars = computed(() => buildPingBars('loss'))
  const latencyRenderBars = computed(() => latencyBars.value.length
    ? latencyBars.value
    : buildLatestPingBars('latency').length
      ? buildLatestPingBars('latency')
      : buildEmptyPingBars('latency'))
  const lossRenderBars = computed(() => lossBars.value.length
    ? lossBars.value
    : buildLatestPingBars('loss').length
      ? buildLatestPingBars('loss')
      : buildEmptyPingBars('loss'))

  const latencyDisplay = computed(() => {
    if (latestLatencyAverage.value !== null)
      return `${Math.round(latestLatencyAverage.value)} ms`
    if (pingStats.hasData.value)
      return `${Math.round(pingStats.avgLatency.value)} ms`
    if (pingStats.loading.value)
      return options.loadingDisplayText ?? '加载中'
    return options.emptyDisplayText ?? '-'
  })

  const lossDisplay = computed(() => {
    if (latestLossAverage.value !== null)
      return `${latestLossAverage.value.toFixed(1)}%`
    if (pingStats.hasData.value)
      return `${pingStats.avgLoss.value.toFixed(1)}%`
    if (pingStats.loading.value)
      return options.loadingDisplayText ?? '加载中'
    return options.emptyDisplayText ?? '-'
  })

  const latencyPanelTooltip = computed(() => {
    if (!pingStats.hasData.value && latestLatencyAverage.value === null) {
      if (pingStats.loading.value)
        return options.loadingPanelTooltipText?.latency ?? ''
      return options.emptyPanelTooltipText?.latency ?? ''
    }
    if (latestLatencyAverage.value !== null)
      return `当前延迟 ${Math.round(latestLatencyAverage.value)} ms；色块为近 1 小时趋势`

    return `近 1 小时平均延迟 ${Math.round(pingStats.avgLatency.value)} ms`
  })

  const lossPanelTooltip = computed(() => {
    if (!pingStats.hasData.value && latestLossAverage.value === null) {
      if (pingStats.loading.value)
        return options.loadingPanelTooltipText?.loss ?? ''
      return options.emptyPanelTooltipText?.loss ?? ''
    }

    const volatility = pingStats.hasData.value && pingStats.avgVolatility.value > 0
      ? `，平均波动 ${pingStats.avgVolatility.value.toFixed(2)}`
      : ''
    if (latestLossAverage.value !== null)
      return `近 1 小时平均丢包 ${latestLossAverage.value.toFixed(1)}%；色块为分段趋势${volatility}`

    return `近 1 小时平均丢包 ${pingStats.avgLoss.value.toFixed(1)}%${volatility}`
  })

  return {
    pingStats,
    pingStatsEnabled,
    pingRecordsQueryHours,
    latencyRenderBars,
    lossRenderBars,
    latencyDisplay,
    lossDisplay,
    latencyPanelTooltip,
    lossPanelTooltip,
  }
}
