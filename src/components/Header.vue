<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { computed, inject, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { useAppStore } from '@/stores/app'

const router = useRouter()
const appStore = useAppStore()
const isScrolled = inject<ReturnType<typeof ref<boolean>>>('isScrolled', ref(false))

const actionButtons = computed(() => {
  const buttons = [{
    title: appStore.themeMode === 'system' ? '跟随系统' : appStore.themeMode === 'light' ? '浅色模式' : '深色模式',
    icon: appStore.themeMode === 'system' ? 'icon-park-outline:dark-mode' : appStore.themeMode === 'light' ? 'icon-park-outline:sun-one' : 'icon-park-outline:moon',
    action: 'toggleTheme',
  }]
  if (appStore.isLoggedIn || !appStore.hideAdminEntryWhenLoggedOut)
    buttons.push({ title: '管理后台', icon: 'icon-park-outline:setting', action: 'jumpToSetting' })
  return buttons
})

function handleButtonClick(action: string) {
  if (action === 'toggleTheme')
    appStore.updateThemeMode()
  if (action === 'jumpToSetting')
    location.href = '/admin'
}

const sitename = computed(() => appStore.publicSettings?.sitename || 'Komari Monitor')
</script>

<template>
  <header class="lnl-header" :class="{ 'is-scrolled': isScrolled }">
    <div class="lnl-header-inner max-w-[1440px] mx-auto">
      <button class="lnl-identity" type="button" aria-label="返回监控总览" @click="router.push('/')">
        <span class="lnl-identity-mark"><img src="/images/logo/leonetlab.png" alt=""></span>
        <span class="lnl-identity-copy">
          <b>{{ sitename }}</b>
          <small>LEONETLAB / NETWORK OBSERVATORY</small>
        </span>
      </button>
      <div class="lnl-header-state" aria-hidden="true">
        <i /> LIVE TELEMETRY
      </div>
      <nav class="lnl-header-actions" aria-label="页面操作">
        <DataTooltip v-for="button in actionButtons" :key="button.action" :content="button.title" placement="left" content-class="whitespace-nowrap text-[11px] px-2">
          <Button variant="ghost" size="icon-sm" :aria-label="button.title" @click="handleButtonClick(button.action)">
            <Icon :icon="button.icon" :width="18" :height="18" />
          </Button>
        </DataTooltip>
      </nav>
    </div>
  </header>
</template>
