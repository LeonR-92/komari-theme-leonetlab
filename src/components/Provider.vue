<script setup lang="ts">
import { onUnmounted, provide, ref, watch } from 'vue'
import { BackTop } from '@/components/ui/back-top'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()

const isScrolled = ref(false)
provide('isScrolled', isScrolled)
let dynamicManifestUrl = ''

function toAbsoluteAppUrl(value: string, fallback = '/'): string {
  try {
    return new URL(value || fallback, window.location.href).href
  }
  catch {
    return new URL(fallback, window.location.origin).href
  }
}

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
  [() => appStore.brandName, () => appStore.brandShortName, () => appStore.brandLogoUrl, () => appStore.brandHeroDescription, () => appStore.isDark],
  ([name, shortName, logoUrl, description, dark]) => {
    document.querySelector<HTMLMetaElement>('meta[name="application-name"]')
      ?.setAttribute('content', name)
    document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')
      ?.setAttribute('href', logoUrl)

    const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    if (!manifestLink)
      return
    if (dynamicManifestUrl)
      URL.revokeObjectURL(dynamicManifestUrl)
    const appRootUrl = toAbsoluteAppUrl('/')
    const absoluteLogoUrl = toAbsoluteAppUrl(logoUrl, '/favicon.ico')
    dynamicManifestUrl = URL.createObjectURL(new Blob([JSON.stringify({
      id: appRootUrl,
      name,
      short_name: shortName,
      description,
      lang: 'zh-CN',
      dir: 'ltr',
      start_url: appRootUrl,
      scope: appRootUrl,
      display: 'standalone',
      display_override: ['standalone', 'minimal-ui'],
      orientation: 'any',
      background_color: dark ? '#030b09' : '#edf7f1',
      theme_color: dark ? '#04100d' : '#edf7f1',
      categories: ['utilities', 'productivity'],
      icons: [{ src: absoluteLogoUrl, sizes: 'any', purpose: 'any' }],
    })], { type: 'application/manifest+json' }))
    manifestLink.href = dynamicManifestUrl
  },
  { immediate: true },
)

onUnmounted(() => {
  if (dynamicManifestUrl)
    URL.revokeObjectURL(dynamicManifestUrl)
})

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
  <BackTop :visibility-height="1" @scrolled="isScrolled = $event" />
</template>
