<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/vue'
import { computed, ref, watch } from 'vue'
import BillingPeriodPicker from '@/components/BillingPeriodPicker.vue'
import NodePingListCell from '@/components/NodePingListCell.vue'
import TrafficProgress from '@/components/TrafficProgress.vue'
import { Badge } from '@/components/ui/badge'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { ProgressThin } from '@/components/ui/progress-thin'
import { useBackgroundSurface } from '@/composables/useBackgroundSurface'
import { useFinanceRates } from '@/composables/useFinanceRates'
import { useAppStore } from '@/stores/app'
import { formatNodeRecurringCost, formatRecurringCostTooltip, resolveCurrency } from '@/utils/financeHelper'
import { formatBytesPerSecondWithConfig, formatBytesWithConfig, formatDateTime, formatUptimeWithFormat, getStatus } from '@/utils/helper'
import { isMobileLike, MOBILE_NO_MOVE_CLASS } from '@/utils/mobilePerf'
import { getOSImage, getOSName } from '@/utils/osImageHelper'
import { getRegionDisplayName, getRegionFlagUrl } from '@/utils/regionHelper'
import { getDaysUntilExpired, getExpireStatus, getExpireTextClass, parseTags } from '@/utils/tagHelper'

interface ColumnConfig {
  key: string
  label: string
  width: string | number
  sortable: boolean
}

interface PriceTagItem {
  text: string
  highlightValue?: string
  prefix?: string
  suffix?: string
}

const props = defineProps<{
  nodes: NodeData[]
  transitionKey?: string
}>()

const emit = defineEmits<{
  click: [node: NodeData]
  pingClick: [node: NodeData]
}>()

const rowStaggerMs = 35
const rowStaggerLimit = 12

const appStore = useAppStore()
const { pickSurfaceClass } = useBackgroundSurface()
const { rates: exchangeRates, conversionAvailable, ensureFinanceRates } = useFinanceRates()

const columns: ColumnConfig[] = [
  { key: 'status', label: '状态', width: '34px', sortable: false },
  { key: 'name', label: '节点信息', width: 'minmax(250px, 1.4fr)', sortable: true },
  { key: 'finance', label: '费用', width: '112px', sortable: false },
  { key: 'uptime', label: '运行时间', width: '116px', sortable: true },
  { key: 'cpu', label: 'CPU', width: '96px', sortable: false },
  { key: 'mem', label: '内存', width: '96px', sortable: false },
  { key: 'disk', label: '硬盘', width: '96px', sortable: false },
  { key: 'traffic', label: '流量', width: '96px', sortable: false },
  { key: 'rate', label: '速率', width: '86px', sortable: true },
]

const sortKey = ref<string>('')
const sortDir = ref<1 | -1>(1)

function handleSort(col: ColumnConfig) {
  if (!col.sortable)
    return
  if (sortKey.value === col.key) {
    sortDir.value = sortDir.value === 1 ? -1 : 1
  }
  else {
    sortKey.value = col.key
    sortDir.value = 1
  }
}

const sortedNodes = computed(() => {
  const nodes = [...props.nodes]
  const key = sortKey.value
  const dir = sortDir.value
  if (!key)
    return nodes
  return nodes.sort((a, b) => {
    switch (key) {
      case 'status': return dir * ((a.online ? 1 : 0) - (b.online ? 1 : 0))
      case 'region': {
        const va = (a.region || '').toLowerCase()
        const vb = (b.region || '').toLowerCase()
        return dir * (va < vb ? -1 : va > vb ? 1 : 0)
      }
      case 'name': {
        const va = (a.name || '').toLowerCase()
        const vb = (b.name || '').toLowerCase()
        return dir * (va < vb ? -1 : va > vb ? 1 : 0)
      }
      case 'uptime': return dir * ((a.uptime ?? 0) - (b.uptime ?? 0))
      case 'os': {
        const va = (a.os || '').toLowerCase()
        const vb = (b.os || '').toLowerCase()
        return dir * (va < vb ? -1 : va > vb ? 1 : 0)
      }
      case 'cpu': return dir * ((a.cpu ?? 0) - (b.cpu ?? 0))
      case 'mem': return dir * ((a.ram ?? 0) / (a.mem_total || 1) - (b.ram ?? 0) / (b.mem_total || 1))
      case 'disk': return dir * ((a.disk ?? 0) / (a.disk_total || 1) - (b.disk ?? 0) / (b.disk_total || 1))
      case 'traffic':
      case 'rate':
        return dir * (((a.net_out ?? 0) + (a.net_in ?? 0)) - ((b.net_out ?? 0) + (b.net_in ?? 0)))
      default: return 0
    }
  })
})

const METRIC_WHITESPACE_PATTERN = /\s+/g
const compactMetric = (value: string) => value.replace(METRIC_WHITESPACE_PATTERN, '')
const formatBytes = (bytes: number) => compactMetric(formatBytesWithConfig(bytes))
const formatBytesPerSecond = (bytes: number) => compactMetric(formatBytesPerSecondWithConfig(bytes))
const formatMetricPair = (used: number, total: number) => `${formatBytes(used)}/${formatBytes(total)}`
const formatUptime = (seconds: number) => formatUptimeWithFormat(seconds, 'hour')

const columnKeys = computed(() => columns.map(c => c.key))

const gridStyle = computed(() => ({
  gridTemplateColumns: columns.map(c => c.width).join(' '),
}))

const offlineOverlayContentStyle = computed(() => {
  const keys = columnKeys.value
  const statusIndex = keys.indexOf('status')
  const regionIndex = keys.indexOf('region')
  const nameIndex = keys.indexOf('name')
  const startColumn = nameIndex !== -1
    ? nameIndex + 1
    : regionIndex !== -1
      ? regionIndex + 2
      : statusIndex === -1 ? 1 : statusIndex + 2
  return { gridColumn: `${startColumn} / -1` }
})

function getFlagSrc(region: string): string {
  return getRegionFlagUrl(region)
}

function hasRegion(region: string | null | undefined): boolean {
  return Boolean(region?.trim())
}

function handleClick(node: NodeData) {
  emit('click', node)
}

function openPingDialog(node: NodeData) {
  emit('pingClick', node)
}

function getRowTransitionKey(node: NodeData): string {
  return props.transitionKey ? `${props.transitionKey}-${node.uuid}` : node.uuid
}

function getRowTransitionStyle(index: number): Record<string, string> {
  return {
    '--node-row-delay': `${Math.min(index, rowStaggerLimit) * rowStaggerMs}ms`,
  }
}

function showTrafficProgress(node: NodeData): boolean {
  return node.traffic_limit > 0
}

function getTrafficUsedPercentage(node: NodeData): number {
  if (node.traffic_limit <= 0)
    return 0
  const { net_total_up = 0, net_total_down = 0, traffic_limit_type } = node
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
  return Math.min((used / node.traffic_limit) * 100, 100)
}

function getTrafficUsed(node: NodeData): number {
  const { net_total_up = 0, net_total_down = 0, traffic_limit_type } = node
  switch (traffic_limit_type) {
    case 'up': return net_total_up
    case 'down': return net_total_down
    case 'min': return Math.min(net_total_up, net_total_down)
    case 'max': return Math.max(net_total_up, net_total_down)
    case 'sum':
    default: return net_total_up + net_total_down
  }
}

function formatTrafficPair(node: NodeData): string {
  const limit = showTrafficProgress(node) ? formatBytes(node.traffic_limit) : '∞'
  return `${formatBytes(getTrafficUsed(node))}/${limit}`
}

function formatOfflineTime(node: NodeData): string {
  return formatDateTime(node.time)
}

function getExpiryTags(node: NodeData): PriceTagItem[] {
  const tags: PriceTagItem[] = []
  const lang = appStore.lang
  // 未设置过期时间（expired_at 为 null/空）时不生成任何过期标签
  if (!node.expired_at)
    return tags
  const days = getDaysUntilExpired(node.expired_at)
  const status = getExpireStatus(node.expired_at)
  if (status === 'expired') {
    tags.push({ text: lang === 'zh-CN' ? '已过期' : 'Expired' })
  }
  else if (status === 'long_term') {
    tags.push({ text: lang === 'zh-CN' ? '长期' : 'Long-term' })
  }
  else if (status !== 'none' && days !== null) {
    if (lang === 'zh-CN')
      tags.push({ text: `余 ${days} 天`, prefix: '余 ', highlightValue: String(days), suffix: ' 天' })
    else
      tags.push({ text: `${days} days left`, highlightValue: String(days), suffix: ' days left' })
  }
  return tags
}

function getRecurringCost(node: NodeData) {
  return formatNodeRecurringCost(
    node,
    appStore.nodeCardCurrency,
    exchangeRates.value,
    appStore.billingDisplayPeriod,
    conversionAvailable.value,
  )
}

function getFinanceTooltip(node: NodeData): string {
  const recurring = getRecurringCost(node)
  return formatRecurringCostTooltip(recurring, appStore.billingDisplayPeriod)
}

const needsCurrencyConversion = computed(() => props.nodes.some(node => (
  Number(node.price) > 0 && resolveCurrency(node.currency) !== appStore.nodeCardCurrency
)))

watch(needsCurrencyConversion, (needed) => {
  if (needed)
    void ensureFinanceRates()
}, { immediate: true })

function getRemainingTimeTagClass(node: NodeData): string {
  if (node.price === 0)
    return ''
  return getExpireTextClass(node.expired_at)
}

function getCustomTags(node: NodeData): Array<string> {
  return parseTags(node.tags).map(t => t.text)
}
</script>

<template>
  <div class="overflow-x-auto overflow-y-hidden min-w-0 p-1 -m-1">
    <div class="min-w-fit w-full flex flex-col gap-1">
      <!-- 表头 -->
      <div
        class="lnl-node-list-head grid gap-2 p-2"
        :class="pickSurfaceClass('bg-background/70', 'bg-background/72')"
        :style="gridStyle"
      >
        <div
          v-for="col in columns" :key="col.key"
          :class="[col.sortable ? 'cursor-pointer' : '', col.key === 'status' ? 'text-center' : 'text-left']"
          :role="col.sortable ? 'button' : undefined"
          :tabindex="col.sortable ? 0 : undefined"
          :aria-label="col.sortable ? `按${col.label}排序` : undefined"
          @click="handleSort(col)"
          @keydown.enter.prevent="handleSort(col)"
          @keydown.space.prevent="handleSort(col)"
        >
          <span class="text-xs text-muted-foreground">
            {{ col.label }}{{ col.sortable && sortKey === col.key ? (sortDir === 1 ? ' ↑' : ' ↓') : '' }}
          </span>
        </div>
      </div>

      <TransitionGroup
        :appear="!appStore.disablePageAnimation"
        :css="!appStore.disablePageAnimation"
        :move-class="isMobileLike ? MOBILE_NO_MOVE_CLASS : undefined"
        name="node-row-switch"
        tag="div"
        class="flex flex-col gap-2"
      >
        <div
          v-for="(node, index) in sortedNodes"
          :key="getRowTransitionKey(node)"
          role="link"
          tabindex="0"
          class="lnl-node-row relative flex h-[72px] cursor-pointer flex-col justify-center px-3"
          :class="[pickSurfaceClass('', ''), !node.online && 'is-offline', appStore.disablePageAnimation && 'is-motion-reduced']"
          :style="getRowTransitionStyle(index)"
          @click="handleClick(node)"
          @keydown.enter="handleClick(node)"
          @keydown.space.prevent="handleClick(node)"
        >
          <div class="grid gap-2 items-center" :style="gridStyle">
            <template v-for="col in columns" :key="col.key">
              <!-- 在线状态指示器 -->
              <div v-if="col.key === 'status'" class="flex justify-center">
                <div class="size-2 rounded-full relative" :class="[node.online ? 'bg-emerald-600' : 'bg-red-600']">
                  <div
                    class="animate-ping motion-reduce:animate-none absolute inset-0 rounded-full opacity-50"
                    :class="[node.online ? 'bg-emerald-600' : 'bg-red-600']"
                  />
                </div>
              </div>

              <!-- 节点名称 -->
              <div v-else-if="col.key === 'name'" class="min-w-0 space-y-1" :class="[!node.online && 'opacity-45']">
                <div class="flex min-w-0 items-center gap-2 text-[13px] font-semibold">
                  <img :src="getOSImage(node.os)" :alt="getOSName(node.os)" class="size-4 shrink-0">
                  <img
                    v-if="hasRegion(node.region)" :src="getFlagSrc(node.region)"
                    :alt="getRegionDisplayName(node.region)" class="h-[14px] w-5 shrink-0 rounded-[3px] object-cover"
                  >
                  <span class="truncate">{{ node.name }}</span>
                </div>
                <div class="flex min-w-0 items-center gap-1.5 overflow-hidden">
                  <Badge
                    v-for="(tag, tagIndex) in getCustomTags(node).slice(0, 3)" :key="tagIndex" variant="outline"
                    class="max-w-24 shrink-0 truncate rounded-full border-muted-foreground/15 px-1.5 !text-[10px] text-muted-foreground"
                  >
                    {{ tag }}
                  </Badge>
                  <span
                    v-for="(tag, tagIndex) in getExpiryTags(node)" :key="`expiry-${tagIndex}`"
                    class="truncate text-[10px] text-muted-foreground"
                  >
                    <template v-if="tag.highlightValue">
                      <span>{{ tag.prefix }}</span>
                      <span :class="getRemainingTimeTagClass(node)">{{ tag.highlightValue }}</span>
                      <span>{{ tag.suffix }}</span>
                    </template>
                    <template v-else>
                      {{ tag.text }}
                    </template>
                  </span>
                </div>
              </div>

              <!-- 费用周期 -->
              <div
                v-else-if="col.key === 'finance'"
                class="lnl-node-list-finance"
              >
                <BillingPeriodPicker
                  variant="list"
                  :text="getRecurringCost(node).text"
                  :tooltip="getFinanceTooltip(node)"
                  :disabled="getRecurringCost(node).oneTime"
                />
              </div>

              <!-- 运行时间 -->
              <div v-else-if="col.key === 'uptime'" class="flex flex-col gap-0.5">
                <span class="text-[10px] text-muted-foreground truncate">
                  {{ formatUptime(node.uptime ?? 0) }}
                </span>
                <NodePingListCell
                  :uuid="node.uuid"
                  :online="node.online"
                  role="button"
                  tabindex="0"
                  class="min-h-6 justify-center rounded-[var(--lnl-radius-control)] outline-none"
                  :aria-label="`${node.name} 延迟/丢包`"
                  @click.stop="openPingDialog(node)"
                  @keydown.enter.stop.prevent="openPingDialog(node)"
                  @keydown.space.stop.prevent="openPingDialog(node)"
                />
              </div>

              <!-- CPU -->
              <div v-else-if="col.key === 'cpu'" class="group">
                <div class="space-y-1">
                  <div class="text-[10px] text-muted-foreground truncate">
                    <span class="inline group-hover:hidden">
                      {{ (node.cpu ?? 0).toFixed(1) }}%
                    </span>
                    <span class="hidden group-hover:inline">
                      {{ (node.load ?? 0).toFixed(2) }}, {{ (node.load5 ?? 0).toFixed(2) }}, {{ (node.load15 ?? 0).toFixed(2)
                      }}
                    </span>
                  </div>
                  <ProgressThin :percentage="node.cpu ?? 0" :status="getStatus(node.cpu ?? 0)" :height="4" />
                </div>
              </div>

              <!-- 内存 -->
              <div v-else-if="col.key === 'mem'" class="group">
                <DataTooltip placement="top" class="block" :content-class="[!node.swap && '!hidden']">
                  <div class="space-y-1">
                    <div class="text-[10px] text-muted-foreground truncate">
                      <span class="inline group-hover:hidden">
                        {{ ((node.ram ?? 0) / (node.mem_total || 1) * 100).toFixed(1) }}%
                      </span>
                      <span class="hidden group-hover:inline">
                        {{ formatMetricPair(node.ram ?? 0, node.mem_total ?? 0) }}
                      </span>
                    </div>
                    <ProgressThin
                      :percentage="(node.ram ?? 0) / (node.mem_total || 1) * 100"
                      :status="getStatus((node.ram ?? 0) / (node.mem_total || 1) * 100)" :height="4"
                    />
                  </div>
                  <template #content>
                    <div class="flex items-center justify-between gap-3 whitespace-nowrap">
                      <span class="text-muted-foreground">Swap</span>
                      <span>{{ formatBytes(node.swap ?? 0) }}</span>
                    </div>
                  </template>
                </DataTooltip>
              </div>

              <!-- 硬盘 -->
              <div v-else-if="col.key === 'disk'" class="group">
                <div class="space-y-1">
                  <div class="text-[10px] text-muted-foreground truncate">
                    <span class="inline group-hover:hidden">
                      {{ ((node.disk ?? 0) / (node.disk_total || 1) * 100).toFixed(1) }}%
                    </span>
                    <span class="hidden group-hover:inline">
                      {{ formatMetricPair(node.disk ?? 0, node.disk_total ?? 0) }}
                    </span>
                  </div>
                  <ProgressThin
                    :percentage="(node.disk ?? 0) / (node.disk_total || 1) * 100"
                    :status="getStatus((node.disk ?? 0) / (node.disk_total || 1) * 100)" :height="4"
                  />
                </div>
              </div>

              <!-- 流量 -->
              <div v-else-if="col.key === 'traffic'" class="group">
                <DataTooltip placement="top" class="flex items-center gap-2" content-class="mb-1.5">
                  <div class="space-y-1 w-full">
                    <div class="text-[10px] text-muted-foreground truncate">
                      <span class="inline group-hover:hidden">
                        {{ getTrafficUsedPercentage(node).toFixed(1) }}%
                      </span>
                      <span class="hidden group-hover:inline">
                        {{ formatTrafficPair(node) }}
                      </span>
                    </div>
                    <TrafficProgress
                      :upload="node.net_total_up ?? 0" :download="node.net_total_down ?? 0"
                      :traffic-limit="node.traffic_limit" :traffic-limit-type="(node.traffic_limit_type || 'sum')"
                      height="4px"
                    />
                  </div>
                  <template #content>
                    <span class="flex flex-row gap-0.5 items-center whitespace-nowrap">
                      <Icon icon="tabler:chevron-up" width="12" height="12" />
                      {{ formatBytes(node.net_total_up ?? 0) }}
                    </span>
                    <span class="flex flex-row gap-0.5 items-center whitespace-nowrap">
                      <Icon icon="tabler:chevron-down" width="12" height="12" />
                      {{ formatBytes(node.net_total_down ?? 0) }}
                    </span>
                  </template>
                </DataTooltip>
              </div>

              <!-- 速率 -->
              <div v-else-if="col.key === 'rate'">
                <div class="text-[10px] flex flex-col ">
                  <span class="text-emerald-600 flex flex-row gap-1 items-center">
                    <Icon icon="tabler:chevron-up" width="12" height="12" />
                    {{ formatBytesPerSecond(node.net_out ?? 0) }}
                  </span>
                  <span class="text-blue-600 flex flex-row gap-1 items-center">
                    <Icon icon="tabler:chevron-down" width="12" height="12" />
                    {{ formatBytesPerSecond(node.net_in ?? 0) }}
                  </span>
                </div>
              </div>
            </template>
          </div>

          <div
            v-if="!node.online" class="absolute inset-0 z-2 flex items-center rounded-[var(--lnl-radius-inner)] bg-background/24 p-2"
            aria-hidden="true"
          >
            <div class="grid gap-2 items-center justify-center" :style="gridStyle">
              <div class="h-full space-y-1" :style="offlineOverlayContentStyle">
                <div class="text-sm font-semibold truncate">
                  <span class="text-red-500">离线</span> {{ node.name }}
                </div>
                <div class="text-xs text-muted-foreground">
                  {{ formatOfflineTime(node) }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>

<style scoped>
.lnl-node-list-head {
  border: 1px solid var(--lnl-line);
  border-radius: var(--lnl-radius-inner);
  background: var(--lnl-surface-inner);
}

.lnl-node-row {
  border: 1px solid var(--lnl-line);
  border-radius: var(--lnl-radius-inner);
  background: var(--lnl-surface-base);
  box-shadow: 0 8px 26px rgb(18 36 30 / 3%);
  font-variant-numeric: tabular-nums;
  transition:
    transform var(--lnl-motion-standard) var(--lnl-ease-out),
    border-color var(--lnl-motion-fast) ease,
    box-shadow var(--lnl-motion-standard) ease,
    background-color var(--lnl-motion-fast) ease,
    opacity var(--lnl-motion-fast) ease;
}

.lnl-node-row:hover,
.lnl-node-row:focus-visible {
  border-color: color-mix(in srgb, var(--lnl-green) 42%, var(--lnl-line));
  background: var(--lnl-surface-raised);
  box-shadow: var(--lnl-shadow-card-hover);
  transform: translate3d(0, -2px, 0);
  outline: none;
}

.lnl-node-row.is-offline {
  border-color: color-mix(in srgb, var(--destructive) 28%, var(--lnl-line));
}

.lnl-node-list-finance {
  display: grid;
  min-width: 0;
  gap: 2px;
  padding: 7px 9px;
  border: 1px solid color-mix(in srgb, var(--lnl-line) 78%, transparent);
  border-radius: var(--lnl-radius-control);
  background: var(--lnl-surface-inner);
}

.lnl-node-list-finance > span {
  color: var(--muted-foreground);
  font-size: 9px;
}

.lnl-node-list-finance > strong {
  overflow: hidden;
  color: var(--foreground);
  font-size: 11px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global(.dark) .lnl-node-row {
  border-color: var(--lnl-line-strong);
  box-shadow: var(--lnl-shadow-card);
}

.lnl-node-row.is-motion-reduced {
  transition: none;
}

.node-row-switch-enter-active,
.node-row-switch-leave-active {
  transition:
    opacity 170ms ease,
    transform 210ms cubic-bezier(0.22, 1, 0.36, 1),
    filter 170ms ease;
}

.node-row-switch-enter-active {
  transition-delay: var(--node-row-delay, 0ms);
}

.node-row-switch-move {
  transition: transform 210ms cubic-bezier(0.22, 1, 0.36, 1);
}

.node-row-switch-enter-from {
  opacity: 0;
  transform: translateY(8px);
  filter: blur(3px);
}

.node-row-switch-leave-to {
  opacity: 0;
  transform: translateY(-5px);
  filter: blur(2px);
}

@media (prefers-reduced-motion: reduce) {
  .node-row-switch-enter-active,
  .node-row-switch-leave-active,
  .node-row-switch-move {
    transition: none;
    transition-delay: 0ms;
  }

  .node-row-switch-enter-from,
  .node-row-switch-leave-to {
    opacity: 1;
    transform: none;
    filter: none;
  }
}
</style>
