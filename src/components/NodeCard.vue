<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/vue'
import { computed, watch } from 'vue'
import BillingPeriodPicker from '@/components/BillingPeriodPicker.vue'
import { Badge } from '@/components/ui/badge'
import { CardX } from '@/components/ui/card-x'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { useBackgroundSurface } from '@/composables/useBackgroundSurface'
import { useFinanceRates } from '@/composables/useFinanceRates'
import { useNodePingDisplay } from '@/composables/useNodePingDisplay'
import { useAppStore } from '@/stores/app'
import { BILLING_PERIOD_LABELS, formatNodeRecurringCost, resolveCurrency } from '@/utils/financeHelper'
import { formatBytesPerSecondWithConfig, formatBytesWithConfig, formatDateTime, formatUptimeWithFormat, getStatus } from '@/utils/helper'
import { getOSImage, getOSName } from '@/utils/osImageHelper'
import { getRegionDisplayName, getRegionFlagUrl } from '@/utils/regionHelper'
import { parseTags } from '@/utils/tagHelper'

const props = defineProps<{ node: NodeData }>()

const emit = defineEmits<{
  click: []
  pingClick: [node: NodeData]
}>()

const appStore = useAppStore()
const { pickSurfaceClass } = useBackgroundSurface()
const { rates: exchangeRates, conversionAvailable, ensureFinanceRates } = useFinanceRates()

const METRIC_WHITESPACE_PATTERN = /\s+/g
const compactMetric = (value: string) => value.replace(METRIC_WHITESPACE_PATTERN, '')
const formatBytes = (bytes: number) => compactMetric(formatBytesWithConfig(bytes, appStore.byteDecimals))
const formatBytesPerSecond = (bytes: number) => compactMetric(formatBytesPerSecondWithConfig(bytes, appStore.byteDecimals))
const formatMetricPair = (used: number, total: number) => `${formatBytes(used)}/${formatBytes(total)}`
const offlineTime = computed(() => formatDateTime(props.node.time))
const expiredDate = computed(() => formatDateTime(props.node.expired_at, 'YYYY-MM-DD'))
const liveStateLabel = computed(() => {
  if (!props.node.online)
    return '离线'
  if (!(props.node.uptime > 0))
    return '在线 —'
  const roundedDays = Math.max(1, Math.round(props.node.uptime / 86_400))
  return `在线 ${roundedDays}天`
})
const liveStateTitle = computed(() => props.node.online && props.node.uptime > 0
  ? `在线时间 ${formatUptimeWithFormat(props.node.uptime, 'hour')}`
  : liveStateLabel.value)

const cpuStatus = computed(() => getStatus(props.node.cpu ?? 0))
const memPercentage = computed(() => (props.node.ram ?? 0) / (props.node.mem_total || 1) * 100)
const memStatus = computed(() => getStatus(memPercentage.value))
const diskPercentage = computed(() => (props.node.disk ?? 0) / (props.node.disk_total || 1) * 100)
const diskStatus = computed(() => getStatus(diskPercentage.value))

const {
  latencyRenderBars,
  lossRenderBars,
  latencyDisplay,
  lossDisplay,
} = useNodePingDisplay(() => props.node.uuid, {
  liveNode: () => props.node,
})

function showTrafficProgress(node: NodeData): boolean {
  return node.traffic_limit > 0
}

const trafficUsedPercentage = computed(() => {
  if (props.node.traffic_limit <= 0)
    return 0
  const { net_total_up = 0, net_total_down = 0, traffic_limit_type } = props.node
  let used = 0
  switch (traffic_limit_type) {
    case 'up': used = net_total_up
      break
    case 'down': used = net_total_down
      break
    case 'min': used = Math.min(net_total_up, net_total_down)
      break
    case 'max': used = Math.max(net_total_up, net_total_down)
      break
    case 'sum':
    default:
      used = net_total_up + net_total_down
      break
  }
  return Math.min((used / props.node.traffic_limit) * 100, 100)
})

const trafficUsed = computed(() => {
  const { net_total_up = 0, net_total_down = 0, traffic_limit_type } = props.node
  switch (traffic_limit_type) {
    case 'up': return net_total_up
    case 'down': return net_total_down
    case 'min': return Math.min(net_total_up, net_total_down)
    case 'max': return Math.max(net_total_up, net_total_down)
    case 'sum':
    default: return net_total_up + net_total_down
  }
})
const trafficDisplay = computed(() => `${formatBytes(trafficUsed.value)}/${showTrafficProgress(props.node) ? formatBytes(props.node.traffic_limit) : '∞'}`)

type GaugeStatus = 'success' | 'warning' | 'error' | 'info'

function normalizedPercentage(value: number): number {
  if (!Number.isFinite(value))
    return 0
  return Math.min(100, Math.max(0, value))
}

function gaugeStyle(value: number): Record<string, string | number> {
  return { strokeDashoffset: 100 - normalizedPercentage(value) }
}

function gaugeClass(status: GaugeStatus): string {
  return `is-${status}`
}

const recurringCost = computed(() => formatNodeRecurringCost(
  props.node,
  appStore.nodeCardCurrency,
  exchangeRates.value,
  appStore.billingDisplayPeriod,
  conversionAvailable.value,
))
const financeTooltip = computed(() => {
  const node = props.node
  if (recurringCost.value.state === 'free')
    return '该节点标记为免费'
  if (recurringCost.value.state === 'missing')
    return '请在 Komari 后台填写价格与计费周期'
  if (recurringCost.value.state === 'invalid')
    return `计费周期无效，无法折算${BILLING_PERIOD_LABELS[appStore.billingDisplayPeriod]}`
  const source = resolveCurrency(node.currency) ?? String(node.currency || '未知币种').trim()
  const expiry = node.expired_at ? ` · 到期 ${expiredDate.value}` : ''
  return `${BILLING_PERIOD_LABELS[appStore.billingDisplayPeriod]} ${recurringCost.value.exactText} · 后台付款 ${source} ${Number(node.price).toFixed(2)} / ${node.billing_cycle} 天${expiry}`
})

watch(
  () => [props.node.price, props.node.currency, appStore.nodeCardCurrency] as const,
  ([price, currency, target]) => {
    if (Number(price) > 0 && resolveCurrency(currency) !== target)
      void ensureFinanceRates()
  },
  { immediate: true },
)

const customTags = computed(() => parseTags(props.node.tags).map(t => t.text))

function hasRegion(region: string | null | undefined): boolean {
  return Boolean(region?.trim())
}

function openPingDialog() {
  emit('pingClick', props.node)
}
</script>

<template>
  <CardX
    hoverable
    role="link"
    tabindex="0"
    :aria-label="`查看节点 ${props.node.name} 详情`"
    :size="appStore.nodeCardDensity === 'compact' ? 'small' : 'medium'"
    class="node-card h-full w-full cursor-pointer"
    header-class="lnl-node-card-header"
    content-class="lnl-node-card-content"
    :class="[
      pickSurfaceClass('', 'backdrop-blur-sm'),
      appStore.nodeCardDensity === 'compact' && 'is-compact',
      appStore.disablePageAnimation && 'is-motion-reduced',
      !props.node.online && 'is-offline',
    ]"
    @click="emit('click')"
    @keydown.enter="emit('click')"
    @keydown.space.prevent="emit('click')"
  >
    <template #header>
      <div class="lnl-node-identity">
        <span class="lnl-node-status" :class="props.node.online ? 'is-online' : 'is-offline'">
          <i />
        </span>
        <div class="lnl-node-title" :title="props.node.name">
          {{ props.node.name }}
        </div>
        <span class="lnl-node-live-state" :title="liveStateTitle">{{ liveStateLabel }}</span>
      </div>
    </template>

    <template #header-extra>
      <div class="lnl-node-platform">
        <img :src="getOSImage(props.node.os)" :alt="getOSName(props.node.os)" class="size-4">
        <img
          v-if="hasRegion(props.node.region)"
          :src="getRegionFlagUrl(props.node.region)"
          :alt="getRegionDisplayName(props.node.region)"
          class="size-5 shrink-0"
        >
      </div>
    </template>

    <template #default>
      <div class="lnl-node-flow">
        <section class="lnl-node-resource-frame" aria-label="资源状态">
          <div class="lnl-node-section-head">
            <span>资源状态</span>
            <small>RESOURCE</small>
          </div>
          <div class="lnl-node-resource-grid">
            <article class="lnl-node-resource-cell">
              <span
                class="lnl-node-gauge"
                :class="gaugeClass(cpuStatus)"
                role="img"
                :aria-label="`CPU 使用率 ${(props.node.cpu ?? 0).toFixed(1)}%`"
              >
                <svg viewBox="0 0 42 42" aria-hidden="true">
                  <circle class="lnl-node-gauge-track" cx="21" cy="21" r="18" pathLength="100" />
                  <circle class="lnl-node-gauge-value" cx="21" cy="21" r="18" pathLength="100" :style="gaugeStyle(props.node.cpu ?? 0)" />
                </svg>
                <i><Icon icon="tabler:cpu" :width="16" :height="16" /></i>
              </span>
              <div class="lnl-node-resource-copy">
                <span>CPU</span>
                <strong>{{ (props.node.cpu ?? 0).toFixed(1) }}%</strong>
                <small :title="`${(props.node.load ?? 0).toFixed(2)}, ${(props.node.load5 ?? 0).toFixed(2)}, ${(props.node.load15 ?? 0).toFixed(2)}`">
                  {{ (props.node.load ?? 0).toFixed(2) }},{{ (props.node.load5 ?? 0).toFixed(2) }},{{ (props.node.load15 ?? 0).toFixed(2) }}
                </small>
              </div>
            </article>

            <article class="lnl-node-resource-cell">
              <span
                class="lnl-node-gauge"
                :class="gaugeClass(memStatus)"
                role="img"
                :aria-label="`内存使用率 ${memPercentage.toFixed(1)}%`"
              >
                <svg viewBox="0 0 42 42" aria-hidden="true">
                  <circle class="lnl-node-gauge-track" cx="21" cy="21" r="18" pathLength="100" />
                  <circle class="lnl-node-gauge-value" cx="21" cy="21" r="18" pathLength="100" :style="gaugeStyle(memPercentage)" />
                </svg>
                <i><Icon icon="tabler:device-sd-card" :width="16" :height="16" /></i>
              </span>
              <div class="lnl-node-resource-copy">
                <span>内存</span>
                <strong>{{ memPercentage.toFixed(1) }}%</strong>
                <DataTooltip placement="top" class="min-w-0" :content-class="[!props.node.swap && '!hidden']">
                  <small :title="formatMetricPair(props.node.ram ?? 0, props.node.mem_total ?? 0)">
                    {{ formatMetricPair(props.node.ram ?? 0, props.node.mem_total ?? 0) }}
                  </small>
                  <template #content>
                    <div class="flex items-center justify-between gap-3 whitespace-nowrap">
                      <span class="text-muted-foreground">Swap</span>
                      <span>{{ formatBytes(props.node.swap ?? 0) }}</span>
                    </div>
                  </template>
                </DataTooltip>
              </div>
            </article>

            <article class="lnl-node-resource-cell">
              <span
                class="lnl-node-gauge"
                :class="gaugeClass(diskStatus)"
                role="img"
                :aria-label="`硬盘使用率 ${diskPercentage.toFixed(1)}%`"
              >
                <svg viewBox="0 0 42 42" aria-hidden="true">
                  <circle class="lnl-node-gauge-track" cx="21" cy="21" r="18" pathLength="100" />
                  <circle class="lnl-node-gauge-value" cx="21" cy="21" r="18" pathLength="100" :style="gaugeStyle(diskPercentage)" />
                </svg>
                <i><Icon icon="tabler:database" :width="16" :height="16" /></i>
              </span>
              <div class="lnl-node-resource-copy">
                <span>硬盘</span>
                <strong>{{ diskPercentage.toFixed(1) }}%</strong>
                <small :title="formatMetricPair(props.node.disk ?? 0, props.node.disk_total ?? 0)">
                  {{ formatMetricPair(props.node.disk ?? 0, props.node.disk_total ?? 0) }}
                </small>
              </div>
            </article>

            <article class="lnl-node-resource-cell">
              <span
                class="lnl-node-gauge"
                :class="[gaugeClass('info'), !showTrafficProgress(props.node) && 'is-unbounded']"
                role="img"
                :aria-label="showTrafficProgress(props.node) ? `月流量使用率 ${trafficUsedPercentage.toFixed(1)}%` : '未设置流量上限'"
              >
                <svg viewBox="0 0 42 42" aria-hidden="true">
                  <circle class="lnl-node-gauge-track" cx="21" cy="21" r="18" pathLength="100" />
                  <circle class="lnl-node-gauge-value" cx="21" cy="21" r="18" pathLength="100" :style="gaugeStyle(trafficUsedPercentage)" />
                </svg>
                <i><Icon icon="tabler:wave-sine" :width="16" :height="16" /></i>
              </span>
              <div class="lnl-node-resource-copy">
                <span>流量</span>
                <strong>{{ showTrafficProgress(props.node) ? `${trafficUsedPercentage.toFixed(1)}%` : '不限额' }}</strong>
                <DataTooltip placement="top" class="min-w-0">
                  <small :title="trafficDisplay">{{ trafficDisplay }}</small>
                  <template #content>
                    <div class="grid gap-1 whitespace-nowrap">
                      <span class="flex items-center gap-1"><Icon icon="tabler:chevron-up" :width="12" />{{ formatBytes(props.node.net_total_up ?? 0) }}</span>
                      <span class="flex items-center gap-1"><Icon icon="tabler:chevron-down" :width="12" />{{ formatBytes(props.node.net_total_down ?? 0) }}</span>
                    </div>
                  </template>
                </DataTooltip>
              </div>
            </article>
          </div>
        </section>

        <section class="lnl-node-network-frame" aria-label="网络与生命周期">
          <div class="lnl-node-section-head">
            <span>网络与生命周期</span>
            <small>LIVE</small>
          </div>
          <div class="lnl-node-network-body" :class="{ 'is-offline': !props.node.online }">
            <div v-if="!props.node.online" class="lnl-node-offline-mask">
              <strong>离线</strong>
              <span>{{ offlineTime }}</span>
            </div>

            <div class="lnl-node-lifecycle-rail">
              <div class="lnl-node-lifecycle-item">
                <Icon icon="tabler:arrow-up-right" :width="15" :height="15" />
                <span>上传</span>
                <strong>{{ formatBytesPerSecond(props.node.net_out ?? 0) }}</strong>
              </div>
              <div class="lnl-node-lifecycle-item is-download">
                <Icon icon="tabler:arrow-down-left" :width="15" :height="15" />
                <span>下载</span>
                <strong>{{ formatBytesPerSecond(props.node.net_in ?? 0) }}</strong>
              </div>
              <div
                class="lnl-node-lifecycle-item lnl-node-finance"
                :data-finance-state="props.node.price === 0 ? 'missing' : props.node.price < 0 ? 'free' : 'paid'"
              >
                <BillingPeriodPicker :text="recurringCost.text" :tooltip="financeTooltip" />
              </div>
            </div>

            <div class="lnl-node-quality-head">
              <span>网络质量</span>
              <small>1H 实时同步</small>
            </div>
            <div class="lnl-node-quality">
              <button
                type="button"
                data-node-ping-panel="latency"
                class="group/panel"
                :aria-label="`${props.node.name} 延迟`"
                @click.stop="openPingDialog"
              >
                <span><i>延迟</i><b>{{ latencyDisplay }}</b></span>
                <em :style="{ gridTemplateColumns: `repeat(${latencyRenderBars.length}, minmax(0, 1fr))` }">
                  <DataTooltip
                    v-for="bar in latencyRenderBars"
                    :key="bar.key"
                    placement="top"
                    :content="bar.tooltip"
                    class="block h-full min-w-0 w-full"
                  >
                    <i data-node-ping-bar :class="bar.className" />
                  </DataTooltip>
                </em>
              </button>
              <button
                type="button"
                data-node-ping-panel="loss"
                class="group/panel"
                :aria-label="`${props.node.name} 丢包`"
                @click.stop="openPingDialog"
              >
                <span><i>丢包</i><b>{{ lossDisplay }}</b></span>
                <em :style="{ gridTemplateColumns: `repeat(${lossRenderBars.length}, minmax(0, 1fr))` }">
                  <DataTooltip
                    v-for="bar in lossRenderBars"
                    :key="bar.key"
                    placement="top"
                    :content="bar.tooltip"
                    class="block h-full min-w-0 w-full"
                  >
                    <i data-node-ping-bar :class="bar.className" />
                  </DataTooltip>
                </em>
              </button>
            </div>
          </div>
        </section>

        <div v-if="customTags.length > 0" class="lnl-node-tags">
          <Badge v-for="(tag, index) in customTags" :key="index" variant="outline">
            {{ tag }}
          </Badge>
        </div>
      </div>
    </template>
  </CardX>
</template>

<style scoped>
.node-card {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  container-type: inline-size;
  border: 1px solid color-mix(in srgb, var(--lnl-line) 82%, var(--foreground) 7%);
  border-radius: var(--lnl-radius-card);
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--card) 96%, white 4%),
    color-mix(in srgb, var(--card) 92%, var(--lnl-surface))
  );
  box-shadow: var(--lnl-shadow-card);
  font-variant-numeric: tabular-nums;
  transition:
    transform var(--lnl-motion-standard) var(--lnl-ease-out),
    box-shadow var(--lnl-motion-standard) ease,
    border-color var(--lnl-motion-fast) ease,
    background-color var(--lnl-motion-fast) ease;
}

.node-card.is-offline {
  border-color: color-mix(in srgb, var(--destructive) 26%, var(--lnl-line));
}

@media (hover: hover) and (pointer: fine) {
  .node-card:hover {
    z-index: 2;
    border-color: color-mix(in srgb, var(--lnl-green) 38%, var(--lnl-line));
    box-shadow: var(--lnl-shadow-card-hover);
    transform: translate3d(0, -4px, 0);
  }
}

@media (hover: none), (pointer: coarse) {
  .node-card:active {
    transform: scale(0.992);
  }
}

:deep(.lnl-node-card-header) {
  min-height: 45px;
  border-bottom: 1px solid color-mix(in srgb, var(--lnl-line) 62%, transparent);
}

:deep(.lnl-node-card-content) {
  min-width: 0;
}

.lnl-node-identity,
.lnl-node-platform {
  display: flex;
  min-width: 0;
  align-items: center;
}

.lnl-node-identity {
  gap: 8px;
}

.lnl-node-platform {
  gap: 7px;
}

.lnl-node-status {
  display: grid;
  width: 13px;
  height: 13px;
  flex: none;
  place-items: center;
  border-radius: 50%;
  background: color-mix(in srgb, var(--success) 12%, transparent);
}

.lnl-node-status i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--success);
  box-shadow: 0 0 10px color-mix(in srgb, var(--success) 48%, transparent);
}

.lnl-node-status.is-offline {
  background: color-mix(in srgb, var(--destructive) 12%, transparent);
}

.lnl-node-status.is-offline i {
  background: var(--destructive);
  box-shadow: none;
}

.lnl-node-title {
  min-width: 0;
  overflow: hidden;
  flex: 1;
  font-size: 15px;
  font-weight: 650;
  letter-spacing: -0.015em;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lnl-node-live-state {
  display: inline-flex;
  width: 72px;
  flex: 0 0 72px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 3px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--success) 11%, transparent);
  color: color-mix(in srgb, var(--success) 85%, var(--foreground));
  font: 600 10px/1 var(--font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-card.is-offline .lnl-node-live-state {
  background: color-mix(in srgb, var(--destructive) 10%, transparent);
  color: var(--destructive);
}

.lnl-node-flow {
  display: grid;
  gap: 10px;
}

.lnl-node-resource-frame,
.lnl-node-network-frame {
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--lnl-line) 68%, transparent);
  border-radius: var(--lnl-radius-inner);
  background: color-mix(in srgb, var(--lnl-surface-inner, var(--lnl-surface)) 72%, transparent);
}

.lnl-node-section-head,
.lnl-node-quality-head {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
}

.lnl-node-section-head {
  min-height: 32px;
  padding: 7px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--lnl-line) 55%, transparent);
}

.lnl-node-section-head span,
.lnl-node-quality-head span {
  font-size: 12px;
  font-weight: 620;
}

.lnl-node-section-head small,
.lnl-node-quality-head small {
  color: var(--muted-foreground);
  font: 600 9px/1.2 var(--font-mono);
  letter-spacing: 0.04em;
}

.lnl-node-resource-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 9px;
}

.lnl-node-resource-cell {
  display: grid;
  min-width: 0;
  grid-template-columns: 50px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  padding: 8px;
  border: 1px solid color-mix(in srgb, var(--lnl-line) 52%, transparent);
  border-radius: 11px;
  background: color-mix(in srgb, var(--lnl-surface-raised, var(--background)) 88%, var(--card));
}

.lnl-node-gauge {
  --lnl-gauge-color: var(--success);
  --lnl-gauge-track: var(--lnl-track);
  position: relative;
  display: grid;
  width: 48px;
  height: 48px;
  flex: none;
  place-items: center;
  border-radius: 50%;
  background: transparent;
}

.lnl-node-gauge > svg {
  position: absolute;
  z-index: 0;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  fill: none;
  transform: rotate(-90deg);
}

.lnl-node-gauge-track,
.lnl-node-gauge-value {
  fill: none;
  stroke-width: 4.5;
}

.lnl-node-gauge-track {
  stroke: var(--lnl-gauge-track);
}

.lnl-node-gauge-value {
  stroke: var(--lnl-gauge-color);
  stroke-dasharray: 100;
  stroke-dashoffset: 100;
  stroke-linecap: round;
  transition: stroke-dashoffset 520ms var(--lnl-ease-emphasis);
}

.lnl-node-gauge::after {
  position: absolute;
  width: 37px;
  height: 37px;
  border: 1px solid color-mix(in srgb, var(--lnl-line) 40%, transparent);
  border-radius: 50%;
  background: color-mix(in srgb, var(--card) 96%, var(--background));
  content: '';
}

.lnl-node-gauge > i {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  color: var(--lnl-gauge-color);
}

.lnl-node-gauge.is-warning {
  --lnl-gauge-color: var(--warning);
}

.lnl-node-gauge.is-error {
  --lnl-gauge-color: var(--destructive);
}

.lnl-node-gauge.is-info {
  --lnl-gauge-color: var(--info);
}

.lnl-node-gauge.is-unbounded {
  background: repeating-conic-gradient(from -90deg, var(--lnl-gauge-color) 0 11deg, var(--lnl-gauge-track) 11deg 19deg);
}

.lnl-node-gauge.is-unbounded > svg {
  opacity: 0;
}

.lnl-node-resource-copy {
  display: grid;
  min-width: 0;
  gap: 1px;
}

.lnl-node-resource-copy > span {
  color: var(--muted-foreground);
  font-size: 11px;
  line-height: 1.25;
}

.lnl-node-resource-copy strong {
  overflow: hidden;
  font-size: 14px;
  font-weight: 670;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lnl-node-resource-copy small {
  display: block;
  min-width: 0;
  overflow: hidden;
  color: var(--muted-foreground);
  font: 10px/1.35 var(--font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lnl-node-network-body {
  position: relative;
  display: grid;
  gap: 8px;
  padding: 9px;
}

.lnl-node-network-body.is-offline > :not(.lnl-node-offline-mask) {
  opacity: 0.28;
  filter: blur(1px);
  pointer-events: none;
}

.lnl-node-offline-mask {
  position: absolute;
  z-index: 3;
  inset: 0;
  display: grid;
  place-content: center;
  gap: 2px;
  text-align: center;
}

.lnl-node-offline-mask strong {
  color: var(--destructive);
  font-size: 14px;
}

.lnl-node-offline-mask span {
  color: var(--muted-foreground);
  font: 10px var(--font-mono);
}

.lnl-node-lifecycle-rail {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}

.lnl-node-lifecycle-item {
  display: grid;
  min-width: 0;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0 6px;
  align-items: center;
  padding: 7px 9px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--lnl-line) 56%, transparent);
  background: color-mix(in srgb, var(--lnl-surface-raised, var(--background)) 86%, var(--card));
}

.lnl-node-lifecycle-item > svg {
  grid-row: 1 / 3;
  color: var(--lnl-green);
}

.lnl-node-lifecycle-item.is-download > svg {
  color: var(--info);
}

.lnl-node-lifecycle-item > span {
  min-width: 0;
  overflow: hidden;
  color: var(--muted-foreground);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lnl-node-lifecycle-item > strong {
  min-width: 0;
  overflow: hidden;
  font: 600 11px/1.35 var(--font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lnl-node-finance-value {
  display: flex;
  min-width: 0;
  overflow: hidden;
  gap: 3px;
  align-items: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global(.dark) .node-card {
  border-color: var(--lnl-line-strong);
  background: linear-gradient(145deg, color-mix(in srgb, var(--card) 94%, #193329 6%), var(--card));
}

:global(.dark) .lnl-node-resource-frame,
:global(.dark) .lnl-node-network-frame {
  border-color: color-mix(in srgb, var(--lnl-line-strong) 78%, transparent);
  box-shadow: inset 0 1px color-mix(in srgb, white 2.5%, transparent);
}

:global(.dark) .lnl-node-gauge-value {
  filter: drop-shadow(0 0 4px color-mix(in srgb, var(--lnl-gauge-color) 30%, transparent));
}

.lnl-node-finance-value span,
.lnl-node-finance-value i,
.lnl-node-finance-value em {
  flex: none;
  font-style: normal;
}

.lnl-node-finance-empty {
  display: block;
  color: var(--muted-foreground);
  font-size: 10px !important;
}

.lnl-node-quality-head {
  padding-top: 2px;
}

.lnl-node-quality {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
}

.lnl-node-quality button {
  display: grid;
  min-width: 0;
  gap: 7px;
  padding: 8px 9px;
  border: 1px solid color-mix(in srgb, var(--lnl-line) 48%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--background) 68%, var(--card));
  color: inherit;
  text-align: left;
  transition:
    border-color var(--lnl-motion-fast) ease,
    background-color var(--lnl-motion-fast) ease,
    transform var(--lnl-motion-fast) var(--lnl-ease-out);
}

.lnl-node-quality button:hover,
.lnl-node-quality button:focus-visible {
  border-color: color-mix(in srgb, var(--lnl-green) 42%, var(--lnl-line));
  background: color-mix(in srgb, var(--lnl-green) 6%, var(--card));
}

.lnl-node-quality button:active {
  transform: scale(0.985);
}

.lnl-node-quality button > span {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.lnl-node-quality button > span i {
  color: var(--muted-foreground);
  font-size: 10px;
  font-style: normal;
}

.lnl-node-quality button > span b {
  overflow: hidden;
  font: 600 11px/1 var(--font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lnl-node-quality button > em {
  display: grid;
  height: 7px;
  min-width: 0;
  gap: 2px;
  align-items: stretch;
  font-style: normal;
}

.lnl-node-quality [data-node-ping-bar] {
  display: block;
  width: 100%;
  min-width: 2px;
  height: 100%;
  border-radius: 999px;
  transform-origin: center;
  transition: transform var(--lnl-motion-fast) var(--lnl-ease-out);
}

.lnl-node-quality :deep([data-node-ping-bar]:hover) {
  transform: scaleY(1.35);
}

.lnl-node-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.lnl-node-tags :deep([data-slot='badge']) {
  max-width: 100%;
  overflow: hidden;
  border-color: color-mix(in srgb, var(--lnl-line) 68%, transparent);
  border-radius: 999px;
  color: var(--muted-foreground);
  font-size: 10px;
  text-overflow: ellipsis;
}

.node-card:not(.is-compact) .lnl-node-resource-cell {
  grid-template-columns: 58px minmax(0, 1fr);
  padding: 10px;
}

.node-card:not(.is-compact) .lnl-node-gauge {
  width: 56px;
  height: 56px;
}

.node-card:not(.is-compact) .lnl-node-gauge::after {
  width: 43px;
  height: 43px;
}

.node-card:not(.is-compact) .lnl-node-title {
  font-size: 16px;
}

.node-card:not(.is-compact) .lnl-node-resource-copy strong {
  font-size: 15px;
}

.node-card.is-motion-reduced,
.node-card.is-motion-reduced * {
  transition: none !important;
}

.node-card.is-motion-reduced:hover,
.node-card.is-motion-reduced:active {
  transform: none;
}

@container (max-width: 320px) {
  .lnl-node-lifecycle-rail {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container (max-width: 285px) {
  .lnl-node-resource-cell {
    grid-template-columns: 42px minmax(0, 1fr);
    gap: 6px;
    padding: 7px;
  }

  .lnl-node-gauge {
    width: 40px;
    height: 40px;
  }

  .lnl-node-gauge::after {
    width: 31px;
    height: 31px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .node-card,
  .node-card * {
    transition: none !important;
  }

  .node-card:hover,
  .node-card:active {
    transform: none;
  }
}
</style>
