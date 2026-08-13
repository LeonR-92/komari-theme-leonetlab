<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const root = ref<HTMLElement | null>(null)
const activated = ref(false)
let observer: IntersectionObserver | null = null

onMounted(() => {
  if (!('IntersectionObserver' in window)) {
    activated.value = true
    return
  }

  observer = new IntersectionObserver((entries) => {
    if (!entries.some(entry => entry.isIntersecting))
      return
    activated.value = true
    observer?.disconnect()
    observer = null
  }, { rootMargin: '160px 0px' })

  if (root.value)
    observer.observe(root.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})
</script>

<template>
  <div ref="root" class="h-48 min-h-48">
    <slot v-if="activated" />
    <div v-else class="size-full rounded-sm bg-foreground/[0.025]" aria-hidden="true" />
  </div>
</template>
