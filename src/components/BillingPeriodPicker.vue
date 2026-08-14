<script setup lang="ts">
import type { BillingDisplayPeriod } from '@/stores/app'
import { Icon } from '@iconify/vue'
import {
  DropdownMenuContent,
  DropdownMenuItemIndicator,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'reka-ui'
import { useAppStore } from '@/stores/app'
import { BILLING_PERIOD_LABELS } from '@/utils/financeHelper'

defineProps<{
  text: string
  tooltip: string
  variant?: 'card' | 'list'
}>()

const appStore = useAppStore()
const periods = Object.entries(BILLING_PERIOD_LABELS) as Array<[BillingDisplayPeriod, string]>

function updatePeriod(value: unknown) {
  if (value === 'monthly' || value === 'quarterly' || value === 'yearly')
    appStore.updateBillingDisplayPeriod(value)
}
</script>

<template>
  <DropdownMenuRoot :modal="false">
    <DropdownMenuTrigger as-child>
      <button
        type="button"
        class="lnl-billing-trigger"
        :class="`is-${variant ?? 'card'}`"
        :title="tooltip"
        aria-label="切换费用展示周期"
        @click.stop
        @pointerdown.stop
      >
        <Icon icon="tabler:calendar-dollar" :width="15" :height="15" />
        <span>{{ BILLING_PERIOD_LABELS[appStore.billingDisplayPeriod] }}</span>
        <strong>{{ text }}</strong>
        <Icon class="lnl-billing-chevron" icon="tabler:chevron-down" :width="13" :height="13" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        class="lnl-billing-menu"
        :side-offset="6"
        align="end"
        :collision-padding="8"
        @click.stop
      >
        <div class="lnl-billing-menu-title">
          费用周期
        </div>
        <DropdownMenuRadioGroup
          :model-value="appStore.billingDisplayPeriod"
          @update:model-value="updatePeriod"
        >
          <DropdownMenuRadioItem
            v-for="([value, label]) in periods"
            :key="value"
            :value="value"
            class="lnl-billing-menu-item"
          >
            <DropdownMenuItemIndicator class="lnl-billing-menu-check">
              <Icon icon="tabler:check" :width="14" :height="14" />
            </DropdownMenuItemIndicator>
            <span>{{ label }}</span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<style>
.lnl-billing-trigger {
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.lnl-billing-trigger.is-card {
  display: grid;
  grid-template-columns: 15px minmax(0, 1fr) 16px;
  grid-template-rows: auto auto;
  align-items: center;
  column-gap: 3px;
  text-align: left;
}

.lnl-billing-trigger.is-card > svg:first-child {
  grid-column: 1;
  grid-row: 1;
  color: var(--lnl-green);
}

.lnl-billing-trigger.is-card > span {
  grid-column: 2;
  grid-row: 1;
  color: var(--muted-foreground);
  font-size: 9px;
}

.lnl-billing-trigger.is-card > strong {
  grid-column: 1 / 3;
  grid-row: 2;
  min-width: 0;
  overflow: hidden;
  font-size: 10px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lnl-billing-trigger.is-card .lnl-billing-chevron {
  grid-column: 3;
  grid-row: 1 / 3;
}

.lnl-billing-trigger.is-list {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 16px;
  gap: 2px 4px;
  padding: 0;
  text-align: left;
}

.lnl-billing-trigger.is-list > svg:first-child {
  display: none;
}

.lnl-billing-trigger.is-list > span {
  grid-column: 1;
  grid-row: 1;
  color: var(--muted-foreground);
  font-size: 9px;
}

.lnl-billing-trigger.is-list > strong {
  grid-column: 1;
  grid-row: 2;
  min-width: 0;
  overflow: hidden;
  font-size: 11px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lnl-billing-trigger.is-list .lnl-billing-chevron {
  grid-column: 2;
  grid-row: 1 / 3;
}

.lnl-billing-chevron {
  align-self: center;
  justify-self: end;
  width: 16px;
  height: 16px;
  padding: 3px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--lnl-green) 8%, transparent);
  color: var(--muted-foreground);
  transition:
    color var(--lnl-motion-fast) ease,
    background-color var(--lnl-motion-fast) ease,
    transform var(--lnl-motion-standard) var(--lnl-ease-out);
}

.lnl-billing-trigger:hover .lnl-billing-chevron,
.lnl-billing-trigger:focus-visible .lnl-billing-chevron,
.lnl-billing-trigger[data-state='open'] .lnl-billing-chevron {
  background: color-mix(in srgb, var(--lnl-green) 15%, transparent);
  color: var(--lnl-green);
}

.lnl-billing-trigger[data-state='open'] .lnl-billing-chevron {
  transform: rotate(180deg);
}

.lnl-billing-trigger:focus-visible {
  border-radius: 7px;
  outline: 2px solid color-mix(in srgb, var(--lnl-green) 42%, transparent);
  outline-offset: 2px;
}

.lnl-billing-menu {
  z-index: 180;
  min-width: 132px;
  padding: 6px;
  border: 1px solid color-mix(in srgb, var(--lnl-green) 36%, var(--border));
  border-radius: var(--lnl-radius-control);
  background: var(--popover);
  box-shadow: var(--lnl-shadow-card-hover);
  color: var(--popover-foreground);
  transform-origin: var(--reka-dropdown-menu-content-transform-origin);
  animation: lnl-billing-menu-in 160ms var(--lnl-ease-out);
}

.lnl-billing-menu-title {
  padding: 5px 8px 7px;
  color: var(--muted-foreground);
  font: 600 9px/1.2 var(--font-mono);
  letter-spacing: 0.1em;
}

.lnl-billing-menu-item {
  position: relative;
  display: grid;
  grid-template-columns: 17px minmax(0, 1fr);
  align-items: center;
  min-height: 36px;
  padding: 0 8px;
  border-radius: 7px;
  outline: none;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
}

.lnl-billing-menu-item[data-highlighted] {
  background: color-mix(in srgb, var(--lnl-green) 9%, transparent);
}

.lnl-billing-menu-check {
  display: grid;
  place-items: center;
  color: var(--lnl-green);
}

@keyframes lnl-billing-menu-in {
  from {
    opacity: 0;
    transform: translateY(-4px) scale(0.98);
  }
}

@media (prefers-reduced-motion: reduce) {
  .lnl-billing-menu,
  .lnl-billing-chevron {
    animation: none;
    transition: none;
  }
}
</style>
