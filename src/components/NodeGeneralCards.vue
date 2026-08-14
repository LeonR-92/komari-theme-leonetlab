<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import type { CurrencyCode } from '@/utils/financeHelper'
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import { CardX } from '@/components/ui/card-x'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { useBackgroundSurface } from '@/composables/useBackgroundSurface'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import * as financeHelper from '@/utils/financeHelper'
import { formatBytesPerSecondSplit, formatBytesSplit } from '@/utils/helper'

const props = defineProps<{
  nodes?: NodeData[]
  globeNodes?: NodeData[]
  transitionKey?: string
}>()

const NodeEarthMaps = defineAsyncComponent(() => import('@/components/NodeEarthMaps.vue'))

const appStore = useAppStore()
const { pickSurfaceClass } = useBackgroundSurface()
const nodesStore = useNodesStore()
const exchangeRates = ref(financeHelper.DEFAULT_EXCHANGE_RATES)
const exchangeRateBaseCurrency = ref<CurrencyCode>('CNY')
const excludeFreeNodes = ref(true)
const financeRateCurrencies: readonly CurrencyCode[] = financeHelper.DISPLAY_FINANCE_CURRENCIES
const summaryNodes = computed(() => props.nodes ?? nodesStore.nodes)
const summaryTransitionKey = computed(() => props.transitionKey ?? 'all')
const metricSwitchTransitionProps = computed(() => ({
  ...(appStore.disablePageAnimation
    ? { css: false }
    : { name: 'metric-switch', mode: 'out-in' as const }),
}))

const openFinanceCard = ref(false)
const financeCurrencyMenuOpen = ref(false)
const financeCurrencyMenuRef = ref<HTMLElement | null>(null)

function getMetricSwitchStyle(index: number): Record<string, string> {
  return {
    '--metric-switch-delay': `${index * 35}ms`,
  }
}

function closeFinanceCurrencyMenu(): void {
  financeCurrencyMenuOpen.value = false
}

function toggleFinanceCurrencyMenu(): void {
  financeCurrencyMenuOpen.value = !financeCurrencyMenuOpen.value
}

function setExchangeRateBaseCurrency(currency: CurrencyCode): void {
  exchangeRateBaseCurrency.value = financeHelper.normalizeCurrency(currency)
  financeHelper.setStoredFinanceCurrency(exchangeRateBaseCurrency.value)
  closeFinanceCurrencyMenu()
}

function handleFinanceCurrencyDocumentPointerDown(event: PointerEvent): void {
  const root = financeCurrencyMenuRef.value
  if (!root || !event.target || root.contains(event.target as Node))
    return
  closeFinanceCurrencyMenu()
}

function handleFinanceCurrencyKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape')
    closeFinanceCurrencyMenu()
}

const totalSpeed = computed(() => {
  const onlineNodes = summaryNodes.value.filter(node => node.online)
  const up = onlineNodes.reduce((sum, node) => sum + (node.net_out || 0), 0)
  const down = onlineNodes.reduce((sum, node) => sum + (node.net_in || 0), 0)
  return { up, down }
})

const totalTraffic = computed(() => {
  const up = summaryNodes.value.reduce((sum, node) => sum + (node.net_total_up || 0), 0)
  const down = summaryNodes.value.reduce((sum, node) => sum + (node.net_total_down || 0), 0)
  return { up, down }
})

const formattedTrafficUp = computed(() => formatBytesSplit(totalTraffic.value.up, appStore.byteDecimals))
const formattedTrafficDown = computed(() => formatBytesSplit(totalTraffic.value.down, appStore.byteDecimals))
const totalTrafficTooltip = computed(() => formatBytesSplit(totalTraffic.value.up + totalTraffic.value.down, appStore.byteDecimals))

const formattedSpeedUp = computed(() => formatBytesPerSecondSplit(totalSpeed.value.up, appStore.byteDecimals))
const formattedSpeedDown = computed(() => formatBytesPerSecondSplit(totalSpeed.value.down, appStore.byteDecimals))

// ==================== 内存 / 硬盘 汇总 ====================
// 离线节点的 ram / disk 为 0，不影响 used 求和；mem_total / disk_total 是静态库存信息，按全量统计
const totalMemory = computed(() => {
  let used = 0
  let total = 0
  for (const node of summaryNodes.value) {
    used += node.ram || 0
    total += node.mem_total || 0
  }
  return { used, total }
})

const totalDisk = computed(() => {
  let used = 0
  let total = 0
  for (const node of summaryNodes.value) {
    used += node.disk || 0
    total += node.disk_total || 0
  }
  return { used, total }
})

const formattedMemoryUsed = computed(() => formatBytesSplit(totalMemory.value.used, appStore.byteDecimals))
const formattedMemoryTotal = computed(() => formatBytesSplit(totalMemory.value.total, appStore.byteDecimals))
const formattedDiskUsed = computed(() => formatBytesSplit(totalDisk.value.used, appStore.byteDecimals))
const formattedDiskTotal = computed(() => formatBytesSplit(totalDisk.value.total, appStore.byteDecimals))

const targetExchangeRate = computed(() => exchangeRates.value[exchangeRateBaseCurrency.value] || 1)
const totalValueCNY = computed(() => {
  return financeHelper.calculateTotalValueCNY(summaryNodes.value, exchangeRates.value, excludeFreeNodes.value)
})
const totalValue = computed(() => {
  return totalValueCNY.value * targetExchangeRate.value
})
const formattedTotalValue = computed(() => {
  return financeHelper.formatFinanceAmount(totalValue.value, exchangeRateBaseCurrency.value)
})
const monthlyAverageCostCNY = computed(() => {
  return financeHelper.calculateTotalMonthlyAverageCostCNY(summaryNodes.value, exchangeRates.value, excludeFreeNodes.value)
})
const monthlyAverageCost = computed(() => {
  return monthlyAverageCostCNY.value * targetExchangeRate.value
})
const formattedMonthlyAverageCost = computed(() => {
  return financeHelper.formatFinanceAmount(monthlyAverageCost.value, exchangeRateBaseCurrency.value)
})
const dailyAverageCostCNY = computed(() => {
  return financeHelper.calculateTotalDailyCostCNY(summaryNodes.value, exchangeRates.value, excludeFreeNodes.value)
})
const dailyAverageCost = computed(() => dailyAverageCostCNY.value * targetExchangeRate.value)
const formattedDailyAverageCost = computed(() => {
  return financeHelper.formatFinanceAmount(dailyAverageCost.value, exchangeRateBaseCurrency.value)
})
const financeSummaryItems = computed(() => [
  {
    label: '付款总额',
    icon: 'tabler:wallet',
    value: formattedTotalValue.value.value,
    symbol: formattedTotalValue.value.symbol,
    currency: formattedTotalValue.value.currency,
  },
  {
    label: '月均支出',
    icon: 'tabler:receipt-2',
    value: formattedMonthlyAverageCost.value.value,
    symbol: formattedMonthlyAverageCost.value.symbol,
    currency: `${formattedMonthlyAverageCost.value.currency}/月`,
  },
  {
    label: '日均支出',
    icon: 'tabler:calendar-dollar',
    value: formattedDailyAverageCost.value.value,
    symbol: formattedDailyAverageCost.value.symbol,
    currency: `${formattedDailyAverageCost.value.currency}/日`,
  },
])
const exchangeRateRows = computed(() => financeRateCurrencies.map((currency) => {
  const baseRate = exchangeRates.value[exchangeRateBaseCurrency.value] || 1
  const targetRate = exchangeRates.value[currency] || 1
  const rate = targetRate / baseRate

  return {
    currency,
    baseCurrency: exchangeRateBaseCurrency.value,
    baseSymbol: financeHelper.CURRENCY_SYMBOLS[exchangeRateBaseCurrency.value],
    targetSymbol: financeHelper.CURRENCY_SYMBOLS[currency],
    rate: new Intl.NumberFormat('zh-CN', {
      maximumFractionDigits: 6,
      minimumFractionDigits: 6,
    }).format(rate),
  }
}))
const showEarth = computed(() => appStore.earthViewMode === 'earth' || appStore.earthViewMode === 'earth-stop')
const showMaps = computed(() => appStore.earthViewMode === 'maps')
const showVisualPanel = computed(() => showEarth.value || showMaps.value)
const wrapperClass = computed(() => showVisualPanel.value
  ? 'p-4 grid grid-cols-12 grid-rows-1 gap-2 h-auto lg:h-58'
  : 'p-4 grid grid-cols-1 gap-2 h-auto')
const cardGridClass = computed(() => showVisualPanel.value
  ? 'h-42 -mt-42 col-span-12 row-start-3 z-9 grid grid-cols-12 grid-rows-2 gap-2 lg:mt-0 lg:h-auto lg:col-span-6 lg:row-start-1'
  : 'col-span-1 grid grid-cols-3 lg:grid-cols-6 gap-2')

onMounted(async () => {
  document.addEventListener('pointerdown', handleFinanceCurrencyDocumentPointerDown, true)
  document.addEventListener('keydown', handleFinanceCurrencyKeydown)
  exchangeRateBaseCurrency.value = financeHelper.getStoredFinanceCurrency()
  excludeFreeNodes.value = financeHelper.shouldExcludeFreeNodes()

  const { rates } = await financeHelper.getDailyExchangeRates()
  exchangeRates.value = rates
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleFinanceCurrencyDocumentPointerDown, true)
  document.removeEventListener('keydown', handleFinanceCurrencyKeydown)
})
</script>

<template>
  <div class="lnl-summary" :class="[wrapperClass, { 'is-motion-reduced': appStore.disablePageAnimation }]">
    <div v-if="showEarth" id="lnl-globe-dashboard-slot" class="lnl-globe-slot col-span-12 col-start-1 row-start-1 lg:col-span-6 lg:col-start-7" />
    <NodeEarthMaps v-else-if="showMaps" :nodes="globeNodes" class="col-span-12 col-start-1 row-start-1 lg:col-span-6 lg:col-start-7" />

    <div class="lnl-summary-metrics" :class="cardGridClass">
      <CardX
        hoverable
        class="group lnl-summary-surface-motion h-full border-none rounded-md"
        :class="[
          pickSurfaceClass('bg-background/60 hover:bg-background', 'bg-background/50 hover:bg-background backdrop-blur-xs'),
          showVisualPanel ? 'col-span-4 row-span-1 col-start-1 row-start-1' : 'col-span-1 row-start-1 col-start-1 min-h-18 lg:min-h-24 lg:row-start-1 lg:col-start-1',
        ]"
        content-class="h-full !p-3"
      >
        <div class="flex h-full flex-col justify-between gap-1">
          <div class="flex items-start justify-between">
            <span class="text-xs font-medium tracking-wider text-muted-foreground">内存用量</span>
            <span class="lnl-metric-tag" aria-hidden="true">MEM</span>
          </div>
          <Transition v-bind="metricSwitchTransitionProps">
            <div
              :key="`memory-${summaryTransitionKey}`" class="flex flex-wrap items-baseline gap-1 min-w-0"
              :style="getMetricSwitchStyle(0)"
            >
              <span class="text-md md:text-2xl font-bold leading-none tracking-tight">
                {{ formattedMemoryUsed.value }}
              </span>
              <span class="text-[11px] md:text-xs font-medium text-muted-foreground truncate">
                {{ formattedMemoryUsed.unit }}/{{ formattedMemoryTotal.value }}{{ formattedMemoryTotal.unit }}
              </span>
            </div>
          </Transition>
        </div>
      </CardX>
      <CardX
        hoverable
        class="group lnl-summary-surface-motion h-full border-none rounded-md"
        :class="[
          pickSurfaceClass('bg-background/60 hover:bg-background', 'bg-background/50 hover:bg-background backdrop-blur-xs'),
          showVisualPanel ? 'col-span-4 row-span-1 col-start-1 row-start-2' : 'col-span-1 row-start-2 col-start-1 min-h-18 lg:min-h-24 lg:row-start-1 lg:col-start-2',
        ]"
        content-class="h-full !p-3"
      >
        <div class="flex h-full flex-col justify-between gap-1">
          <div class="flex items-start justify-between">
            <span class="text-xs font-medium tracking-wider text-muted-foreground">硬盘用量</span>
            <span class="lnl-metric-tag" aria-hidden="true">DSK</span>
          </div>
          <Transition v-bind="metricSwitchTransitionProps">
            <div
              :key="`disk-${summaryTransitionKey}`" class="flex flex-wrap items-baseline gap-1 min-w-0"
              :style="getMetricSwitchStyle(1)"
            >
              <span class="text-md md:text-2xl font-bold leading-none tracking-tight">{{ formattedDiskUsed.value
              }}</span>
              <span class="text-[11px] md:text-xs font-medium text-muted-foreground truncate">
                {{ formattedDiskUsed.unit }}/{{ formattedDiskTotal.value }}{{ formattedDiskTotal.unit }}
              </span>
            </div>
          </Transition>
        </div>
      </CardX>
      <div
        class="relative w-full h-full"
        :class="showVisualPanel ? 'col-span-4 row-span-1 col-start-5 row-start-1' : 'col-span-1 row-start-1 col-start-2 min-h-18 lg:min-h-24 lg:row-start-1 lg:col-start-3'"
      >
        <CardX
          hoverable
          class="group lnl-summary-surface-motion h-full border-none rounded-md"
          :class="pickSurfaceClass('bg-background/60 hover:bg-background', 'bg-background/50 hover:bg-background backdrop-blur-xs')"
          content-class="h-full !p-3" role="button" tabindex="0" aria-controls="lnl-finance-popover"
          :aria-expanded="openFinanceCard" data-finance-trigger
          @click="openFinanceCard = !openFinanceCard"
          @keydown.enter.prevent="openFinanceCard = !openFinanceCard"
          @keydown.space.prevent="openFinanceCard = !openFinanceCard"
        >
          <div class="flex h-full flex-col justify-between gap-1">
            <span class="sr-only">按下查看财务汇率详情</span>
            <div class="flex items-start justify-between">
              <span class="text-xs font-medium tracking-wider text-muted-foreground">付款总额</span>
              <span class="lnl-metric-tag" aria-hidden="true">VAL</span>
            </div>
            <Transition v-bind="metricSwitchTransitionProps">
              <div
                :key="`payment-total-${summaryTransitionKey}`" class="flex flex-wrap items-baseline gap-1 min-w-0"
                :style="getMetricSwitchStyle(2)"
              >
                <span class="text-md md:text-2xl font-bold leading-none tracking-tight">
                  {{ formattedTotalValue.symbol }}{{ formattedTotalValue.value }}
                </span>
                <span class="block truncate text-[11px] md:text-xs font-medium text-muted-foreground">
                  {{ formattedTotalValue.currency }}
                </span>
              </div>
            </Transition>
          </div>
        </CardX>
        <CardX
          id="lnl-finance-popover"
          hoverable data-finance-popover
          class="lnl-finance-popover absolute top-0 z-20 h-42 rounded-md border-none shadow-[0_0_20px,0_0_0_1px] shadow-emerald-600/10"
          :class="[
            pickSurfaceClass('bg-background', 'bg-background/50 backdrop-blur-lg'),
            openFinanceCard && 'is-open',
          ]"
          content-class="h-full !p-4" @click="openFinanceCard = false"
        >
          <div class="flex h-full min-w-0 flex-col overflow-visible">
            <div class="shrink-0 grid grid-cols-3 gap-1.5">
              <div v-for="(item, index) in financeSummaryItems" :key="item.label" class="min-w-0">
                <div class="flex mb-1.5 items-center text-xs font-medium text-muted-foreground">
                  {{ item.label }}
                </div>
                <Transition v-bind="metricSwitchTransitionProps">
                  <div
                    :key="`remaining-value-${summaryTransitionKey}-${exchangeRateBaseCurrency}`" class="flex min-w-0 items-baseline truncate"
                    :style="getMetricSwitchStyle(index)"
                  >
                    <span class="shrink-0 text-xs mr-0.5 font-semibold leading-none text-muted-foreground">
                      {{ item.symbol }}
                    </span>
                    <span class=" text-sm md:text-lg font-bold leading-none tracking-tight">
                      {{ item.value }}
                    </span>
                  </div>
                </Transition>
              </div>
            </div>
            <div class="flex-1" />
            <div class="shrink-0 flex flex-col flex-1">
              <div class="flex mb-1 items-center justify-between gap-2">
                <div class="flex items-center gap-1 text-xs font-medium tracking-wider text-muted-foreground">
                  今日汇率
                </div>
                <div ref="financeCurrencyMenuRef" class="relative shrink-0" @click.stop>
                  <button
                    id="exchange-rate-base" type="button"
                    class="flex items-center gap-1 rounded-sm border border-border/70 bg-background/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus:text-foreground"
                    name="exchange-rate-base" aria-label="切换汇率基准币种" aria-haspopup="listbox"
                    :aria-expanded="financeCurrencyMenuOpen" @click.stop="toggleFinanceCurrencyMenu"
                    @keydown.down.prevent="financeCurrencyMenuOpen = true"
                  >
                    <span>{{ exchangeRateBaseCurrency }}</span>
                    <span aria-hidden="true" class="text-[8px] leading-none">▾</span>
                  </button>
                  <div
                    v-if="financeCurrencyMenuOpen" role="listbox" aria-label="汇率基准币种"
                    class="absolute right-0 top-full z-30 mt-1 min-w-[76px] border border-[color:var(--lnl-line)] bg-background/95 p-0.5 shadow-lg backdrop-blur-md"
                  >
                    <button
                      v-for="currency in financeRateCurrencies" :key="currency" type="button" role="option"
                      :aria-selected="currency === exchangeRateBaseCurrency"
                      class="flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-[10px] font-medium text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
                      :class="currency === exchangeRateBaseCurrency && 'bg-foreground/5 text-foreground'"
                      @click.stop="setExchangeRateBaseCurrency(currency)"
                    >
                      {{ currency }}
                    </button>
                  </div>
                </div>
              </div>
              <div class="flex-1" />
              <div class="grid grid-cols-2 gap-y-1 gap-x-4">
                <div
                  v-for="(row, index) in exchangeRateRows" :key="row.currency"
                  class="text-[11px] flex items-center "
                >
                  <Transition v-bind="metricSwitchTransitionProps">
                    <div :key="`remaining-value-${exchangeRateBaseCurrency}`" class="flex-1 flex justify-between" :style="getMetricSwitchStyle(index)">
                      <span class="text-muted-foreground">
                        {{ row.currency }}
                      </span>
                      <span>
                        {{ row.targetSymbol }}{{ row.rate }}
                      </span>
                    </div>
                  </Transition>
                </div>
              </div>
            </div>
          </div>
        </CardX>
      </div>
      <CardX
        hoverable
        class="group lnl-summary-surface-motion h-full border-none rounded-md"
        :class="[
          pickSurfaceClass('bg-background/60 hover:bg-background', 'bg-background/50 hover:bg-background backdrop-blur-xs'),
          showVisualPanel ? 'col-span-4 row-span-1 col-start-5 row-start-2' : 'col-span-1 row-start-2 col-start-2 min-h-18 lg:min-h-24 lg:row-start-1 lg:col-start-4',
        ]"
        content-class="h-full !p-3"
      >
        <div class="flex h-full flex-col justify-between gap-1">
          <div class="flex items-start justify-between">
            <span class="text-xs font-medium tracking-wider text-muted-foreground">累计流量</span>
            <span class="lnl-metric-tag" aria-hidden="true">SUM</span>
          </div>
          <DataTooltip
            as="span" placement="top"
            :content="`↑ ${formattedTrafficUp.value} ${formattedTrafficUp.unit}\n↓ ${formattedTrafficDown.value} ${formattedTrafficDown.unit}`"
            class="min-w-0" content-class="whitespace-pre px-2 py-1 left-0 -translate-x-0 leading-normal"
          >
            <Transition v-bind="metricSwitchTransitionProps">
              <div
                :key="`traffic-${summaryTransitionKey}`" class="flex items-baseline gap-1"
                :style="getMetricSwitchStyle(3)"
              >
                <span class="inline-block text-md md:text-2xl font-bold leading-none tracking-tight">
                  {{ totalTrafficTooltip.value }}
                </span>
                <span class="inline-block text-[11px] md:text-xs font-medium text-muted-foreground">
                  {{ totalTrafficTooltip.unit }}
                </span>
              </div>
            </Transition>
          </DataTooltip>
        </div>
      </CardX>

      <CardX
        hoverable
        class="group lnl-summary-surface-motion h-full border-none rounded-md"
        :class="[
          pickSurfaceClass('bg-background/60 hover:bg-background', 'bg-background/50 hover:bg-background backdrop-blur-xs'),
          showVisualPanel ? 'col-span-4 row-span-1 col-start-9 row-start-1' : 'col-span-1 row-start-1 col-start-3 min-h-18 lg:min-h-24 lg:row-start-1 lg:col-start-5',
        ]"
        content-class="h-full !p-3"
      >
        <div class="flex h-full flex-col justify-between gap-1">
          <div class="flex items-start justify-between">
            <span class="text-xs font-medium tracking-wider text-muted-foreground">实时上行</span>
            <span class="lnl-metric-tag" aria-hidden="true">UP</span>
          </div>
          <Transition v-bind="metricSwitchTransitionProps">
            <div
              :key="`speed-up-${summaryTransitionKey}`" class="flex items-baseline gap-1"
              :style="getMetricSwitchStyle(4)"
            >
              <span class="text-md md:text-2xl font-bold leading-none tracking-tight">{{ formattedSpeedUp.value
              }}</span>
              <span class="text-[11px] md:text-xs font-medium text-muted-foreground">{{ formattedSpeedUp.unit }}</span>
            </div>
          </Transition>
        </div>
      </CardX>
      <CardX
        hoverable
        class="group lnl-summary-surface-motion h-full border-none rounded-md"
        :class="[
          pickSurfaceClass('bg-background/60 hover:bg-background', 'bg-background/50 hover:bg-background backdrop-blur-xs'),
          showVisualPanel ? 'col-span-4 row-span-1 col-start-9 row-start-2' : 'col-span-1 row-start-2 col-start-3 min-h-18 lg:min-h-24 lg:row-start-1 lg:col-start-6',
        ]"
        content-class="h-full !p-3"
      >
        <div class="flex h-full flex-col justify-between gap-1">
          <div class="flex items-start justify-between">
            <span class="text-xs font-medium tracking-wider text-muted-foreground">实时下行</span>
            <span class="lnl-metric-tag" aria-hidden="true">DLN</span>
          </div>
          <Transition v-bind="metricSwitchTransitionProps">
            <div
              :key="`speed-down-${summaryTransitionKey}`" class="flex items-baseline gap-1"
              :style="getMetricSwitchStyle(5)"
            >
              <span class="text-md md:text-2xl font-bold leading-none tracking-tight">
                {{ formattedSpeedDown.value }}
              </span>
              <span class="text-[11px] md:text-xs font-medium text-muted-foreground">{{ formattedSpeedDown.unit
              }}</span>
            </div>
          </Transition>
        </div>
      </CardX>
    </div>
  </div>
</template>

<style scoped>
.lnl-summary-surface-motion {
  transition:
    transform var(--lnl-motion-standard) var(--lnl-ease-out),
    box-shadow var(--lnl-motion-standard) ease,
    border-color var(--lnl-motion-fast) ease,
    background-color var(--lnl-motion-fast) ease;
}

.lnl-summary.is-motion-reduced .lnl-summary-surface-motion {
  transition: none;
}

.lnl-metric-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 3px;
  border: 1px solid color-mix(in srgb, var(--lnl-line) 70%, transparent);
  color: color-mix(in srgb, var(--muted-foreground) 55%, transparent);
  font: 500 8px/1 var(--font-mono);
  letter-spacing: 0.14em;
  opacity: 0.85;
  transition:
    color 180ms ease,
    border-color 180ms ease,
    opacity 180ms ease;
}

.group:hover .lnl-metric-tag {
  border-color: color-mix(in srgb, var(--lnl-line) 92%, var(--foreground) 8%);
  color: var(--muted-foreground);
  opacity: 1;
}

.lnl-finance-popover {
  left: 50%;
  width: 260%;
  max-width: 22rem;
  opacity: 0;
  pointer-events: none;
  transform: translate3d(-50%, -25%, 0) scale(0.5);
  transform-origin: top center;
  transition:
    opacity 180ms ease,
    transform 280ms cubic-bezier(0.16, 1, 0.3, 1);
}

.lnl-finance-popover.is-open {
  opacity: 1;
  pointer-events: auto;
  transform: translate3d(-50%, -5%, 0) scale(1);
}

.metric-switch-enter-active,
.metric-switch-leave-active {
  transition:
    opacity 160ms ease,
    transform 180ms cubic-bezier(0.22, 1, 0.36, 1),
    filter 180ms ease;
}

.metric-switch-enter-active {
  transition-delay: var(--metric-switch-delay, 0ms);
}

.metric-switch-enter-from {
  opacity: 0;
  transform: translateY(6px);
  filter: blur(3px);
}

.metric-switch-leave-to {
  opacity: 0;
  transform: translateY(-4px);
  filter: blur(2px);
}

@media (max-width: 760px) {
  .lnl-finance-popover {
    right: 0;
    left: auto;
    width: calc(200% + 8px);
    max-width: calc(100vw - 32px);
    transform: translate3d(0, -18%, 0) scale(0.92);
    transform-origin: top right;
  }

  .lnl-finance-popover.is-open {
    transform: translate3d(0, -5%, 0) scale(1);
  }

  .lnl-summary-metrics {
    width: calc(100vw - 32px) !important;
    max-width: calc(100vw - 32px);
    min-width: 0;
    height: auto !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    grid-template-rows: repeat(3, minmax(76px, auto)) !important;
  }

  .lnl-summary-metrics > :nth-child(1) {
    grid-column: 1 !important;
    grid-row: 1 !important;
  }
  .lnl-summary-metrics > :nth-child(2) {
    grid-column: 1 !important;
    grid-row: 2 !important;
  }
  .lnl-summary-metrics > :nth-child(3) {
    grid-column: 2 !important;
    grid-row: 1 !important;
  }
  .lnl-summary-metrics > :nth-child(4) {
    grid-column: 2 !important;
    grid-row: 2 !important;
  }
  .lnl-summary-metrics > :nth-child(5) {
    grid-column: 1 !important;
    grid-row: 3 !important;
  }
  .lnl-summary-metrics > :nth-child(6) {
    grid-column: 2 !important;
    grid-row: 3 !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  .metric-switch-enter-active,
  .metric-switch-leave-active {
    transition: none;
    transition-delay: 0ms;
  }

  .metric-switch-enter-from,
  .metric-switch-leave-to {
    opacity: 1;
    transform: none;
    filter: none;
  }
}
</style>
