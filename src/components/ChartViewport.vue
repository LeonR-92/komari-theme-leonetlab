<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { scheduleChartActivation } from '@/utils/chartActivationQueue'

const root = ref<HTMLElement | null>(null)
const activated = ref(false)
let observer: IntersectionObserver | null = null
let cancelActivation: (() => void) | null = null

function activateChart(): void {
  if (activated.value || cancelActivation)
    return
  cancelActivation = scheduleChartActivation(() => {
    cancelActivation = null
    activated.value = true
  })
}

onMounted(() => {
  if (!('IntersectionObserver' in window)) {
    activateChart()
    return
  }

  observer = new IntersectionObserver((entries) => {
    if (!entries.some(entry => entry.isIntersecting))
      return
    observer?.disconnect()
    observer = null
    activateChart()
  }, { rootMargin: '160px 0px' })

  if (root.value)
    observer.observe(root.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  cancelActivation?.()
  cancelActivation = null
})
</script>

<template>
  <div ref="root" class="h-48 min-h-48" :aria-busy="!activated">
    <slot v-if="activated" />
    <div v-else class="size-full rounded-sm bg-foreground/[0.025]" aria-hidden="true" />
  </div>
</template>
