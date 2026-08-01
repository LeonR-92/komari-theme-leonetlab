<script lang="ts" setup>
import type { ToasterProps } from 'vue-sonner'

import { Icon } from '@iconify/vue'
import { Toaster as Sonner } from 'vue-sonner'
import { cn } from '@/lib/utils'
import 'vue-sonner/style.css'

const props = defineProps<ToasterProps>()
</script>

<template>
  <Sonner
    :class="cn('toaster lnl-toaster group', props.class)" :style="{
      '--normal-bg': 'var(--popover)',
      '--normal-text': 'var(--popover-foreground)',
      '--normal-border': 'var(--border)',
      '--border-radius': 'var(--radius)',
    }" v-bind="props"
  >
    <template #success-icon>
      <Icon icon="lucide:circle-check" class="size-4" />
    </template>
    <template #info-icon>
      <Icon icon="lucide:info" class="size-4" />
    </template>
    <template #warning-icon>
      <Icon icon="lucide:triangle-alert" class="size-4" />
    </template>
    <template #error-icon>
      <Icon icon="lucide:octagon-x" class="size-4" />
    </template>
    <template #loading-icon>
      <div>
        <Icon icon="lucide:loader-2" class="size-4 animate-spin" />
      </div>
    </template>
    <template #close-icon>
      <Icon icon="lucide:x" class="size-4" />
    </template>
  </Sonner>
</template>

<style>
.lnl-toaster[data-sonner-toaster] {
  --width: min(400px, calc(100vw - 24px));
  top: max(12px, env(safe-area-inset-top)) !important;
  right: max(12px, env(safe-area-inset-right)) !important;
  left: auto !important;
  width: var(--width) !important;
  transform: none !important;
  font-family: var(--font-sans);
}

.lnl-toaster [data-sonner-toast] {
  width: 100%;
  min-height: 54px;
  padding: 12px 42px 12px 14px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--lnl-green) 26%, var(--border));
  border-radius: 2px;
  background: color-mix(in srgb, var(--popover) 97%, var(--lnl-green) 3%);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--background) 75%, transparent),
    0 14px 34px color-mix(in srgb, #00150e 18%, transparent);
  color: var(--popover-foreground);
}

.lnl-toaster [data-title] {
  overflow-wrap: anywhere;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.45;
}

.lnl-toaster [data-description] {
  margin-top: 3px;
  color: var(--muted-foreground);
  font-size: 11px;
  line-height: 1.45;
}

.lnl-toaster [data-close-button] {
  top: 50%;
  right: 10px;
  left: auto;
  width: 28px;
  height: 28px;
  border-color: color-mix(in srgb, var(--lnl-green) 22%, var(--border));
  background: var(--background);
  color: var(--muted-foreground);
  transform: translateY(-50%);
  transition:
    color var(--lnl-motion-fast) ease,
    border-color var(--lnl-motion-fast) ease,
    transform var(--lnl-motion-fast) var(--lnl-ease-out);
}

.lnl-toaster [data-close-button]:hover {
  border-color: var(--lnl-green);
  color: var(--lnl-green);
  transform: translateY(-50%) scale(1.05);
}

@media (max-width: 560px) {
  .lnl-toaster[data-sonner-toaster] {
    top: max(8px, env(safe-area-inset-top)) !important;
    right: 10px !important;
    left: 10px !important;
    width: auto !important;
  }

  .lnl-toaster [data-sonner-toast] {
    min-height: 50px;
    padding-block: 10px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .lnl-toaster [data-sonner-toast],
  .lnl-toaster [data-close-button] {
    transition: none !important;
  }
}
</style>
