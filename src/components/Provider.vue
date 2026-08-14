<script setup lang="ts">
import { provide, ref, watch } from 'vue'
import CustomCursor from '@/components/CustomCursor.vue'
import { BackTop } from '@/components/ui/back-top'
import { PALETTE_THEME_COLORS, useAppStore } from '@/stores/app'

const appStore = useAppStore()

const isScrolled = ref(false)
provide('isScrolled', isScrolled)
watch(
  () => [appStore.resolvedThemeMode, appStore.colorPalette] as const,
  ([mode, palette]) => {
    const dark = mode === 'dark'
    const root = document.documentElement
    root.classList.toggle('dark', dark)
    root.dataset.palette = palette
    root.style.colorScheme = dark ? 'dark' : 'light'
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute('content', PALETTE_THEME_COLORS[palette][mode])
  },
  { immediate: true },
)

watch(
  () => appStore.brandName,
  (name) => {
    document.querySelector<HTMLMetaElement>('meta[name="application-name"]')
      ?.setAttribute('content', name)
    document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]')
      ?.setAttribute('content', name)
  },
  { immediate: true },
)

watch(
  () => appStore.backgroundEnabled,
  (enabled) => {
    const body = document.body
    if (enabled)
      body.style.setProperty('background-color', 'transparent', 'important')
    else
      body.style.removeProperty('background-color')
  },
  { immediate: true },
)
</script>

<template>
  <slot />
  <CustomCursor />
  <BackTop :visibility-height="1" @scrolled="isScrolled = $event" />
</template>
