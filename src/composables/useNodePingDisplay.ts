import type { MaybeRefOrGetter } from 'vue'
import type { NodeData } from '@/stores/nodes'
import { computed, toValue } from 'vue'
import { NODE_PING_BAR_COUNT, useNodePingStats } from '@/composables/useNodePingStats'
import { useNodesStore } from '@/stores/nodes'
import { formatDateTime } from '@/utils/helper'
import { getLatencyToneClass, getLossToneClass } from '@/utils/pingMetrics'

export type NodePingMetric = 'latency' | 'loss'

// getRecords 在新版主控中返回的是近期可用样本，不保证覆盖完整 1 小时。
const RECENT_PING_RECORDS_QUERY_HOURS = 1

export interface NodePingBar {
  key: string
  className: string
  tooltip: string
}

interface UseNodePingDisplayOptions {
  enabled?: MaybeRefOrGetter<boolean>
  liveNode?: MaybeRefOrGetter<NodeData | undefined>
  loadingDisplayText?: string
  emptyDisplayText?: string
  loadingPanelTooltipText?: Partial<Record<NodePingMetric, string>>
  emptyPanelTooltipText?: Partial<Record<NodePingMetric, string>>
}

export function useNodePingDisplay(
  uuid: MaybeRefOrGetter<string>,
  options: UseNodePingDisplayOptions = {},
) {
  const nodesStore = useNodesStore()
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

  const livePing = computed(() => {
    const node = options.liveNode
      ? toValue(options.liveNode)
      : nodesStore.nodesByUuid.get(toValue(uuid))
    const samples = Object.values(node?.ping ?? {})
    const latency = samples
      .map(sample => sample.latest)
      .filter(value => Number.isFinite(value) && value >= 0)
    const loss = samples
      .map(sample => sample.loss)
      .filter(value => Number.isFinite(value) && value >= 0)

    return {
      time: node?.time ?? '',
      latency: latency.length
        ? latency.reduce((sum, value) => sum + value, 0) / latency.length
        : null,
      loss: loss.length
        ? loss.reduce((sum, value) => sum + value, 0) / loss.length
        : null,
    }
  })

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

  function withLiveTail(metric: NodePingMetric, bars: NodePingBar[]): NodePingBar[] {
    const value = livePing.value[metric]
    const next = bars.length
      ? [...bars]
      : buildEmptyPingBars(metric)
    if (value === null)
      return next
    const time = livePing.value.time
      ? formatDateTime(livePing.value.time, 'HH:mm:ss')
      : '当前'
    next[next.length - 1] = {
      key: `${metric}-live-${livePing.value.time || 'now'}`,
      className: metric === 'latency'
        ? getLatencyToneClass(value)
        : getLossToneClass(value),
      tooltip: metric === 'latency'
        ? `实时 · ${time}\n${Math.round(value)} ms`
        : `实时 · ${time}\n${value.toFixed(1)}%`,
    }
    return next
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

  const latencyBars = computed(() => buildPingBars('latency'))
  const lossBars = computed(() => buildPingBars('loss'))
  const latencyRenderBars = computed(() => withLiveTail('latency', latencyBars.value))
  const lossRenderBars = computed(() => withLiveTail('loss', lossBars.value))

  const latencyDisplay = computed(() => {
    if (livePing.value.latency !== null)
      return `${Math.round(livePing.value.latency)} ms`
    if (pingStats.hasData.value)
      return `${Math.round(pingStats.avgLatency.value)} ms`
    if (pingStats.loading.value)
      return options.loadingDisplayText ?? '加载中'
    return options.emptyDisplayText ?? '-'
  })

  const lossDisplay = computed(() => {
    if (livePing.value.loss !== null)
      return `${livePing.value.loss.toFixed(1)}%`
    if (pingStats.hasData.value)
      return `${pingStats.avgLoss.value.toFixed(1)}%`
    if (pingStats.loading.value)
      return options.loadingDisplayText ?? '加载中'
    return options.emptyDisplayText ?? '-'
  })

  const latencyPanelTooltip = computed(() => {
    if (livePing.value.latency !== null)
      return `实时延迟 ${Math.round(livePing.value.latency)} ms`
    if (!pingStats.hasData.value) {
      if (pingStats.loading.value)
        return options.loadingPanelTooltipText?.latency ?? ''
      return options.emptyPanelTooltipText?.latency ?? ''
    }
    return `平均延迟 ${Math.round(pingStats.avgLatency.value)} ms`
  })

  const lossPanelTooltip = computed(() => {
    if (livePing.value.loss !== null)
      return `实时丢包 ${livePing.value.loss.toFixed(1)}%`
    if (!pingStats.hasData.value) {
      if (pingStats.loading.value)
        return options.loadingPanelTooltipText?.loss ?? ''
      return options.emptyPanelTooltipText?.loss ?? ''
    }

    const volatility = pingStats.avgVolatility.value > 0
      ? `，平均波动 ${pingStats.avgVolatility.value.toFixed(2)}`
      : ''
    return `平均丢包 ${pingStats.avgLoss.value.toFixed(1)}%${volatility}`
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
