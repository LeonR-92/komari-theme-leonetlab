<script setup lang="ts">
import { provide, ref, watch } from 'vue'
import CustomCursor from '@/components/CustomCursor.vue'
import { BackTop } from '@/components/ui/back-top'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()

const isScrolled = ref(false)
provide('isScrolled', isScrolled)
watch(
  () => appStore.isDark,
  (dark) => {
    const root = document.documentElement
    if (dark)
      root.classList.add('dark')
    else root.classList.remove('dark')
    root.style.colorScheme = dark ? 'dark' : 'light'
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute('content', dark ? '#04100d' : '#edf7f1')
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
