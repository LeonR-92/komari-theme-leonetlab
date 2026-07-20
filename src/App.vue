<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { Toaster } from '@/components/ui/sonner'
import { useAppStore } from '@/stores/app'
import { destroyInitManager, initApp } from '@/utils/init'
import Background from './components/Background.vue'
import Footer from './components/Footer.vue'
import Header from './components/Header.vue'
import LoadingCover from './components/LoadingCover.vue'
import Provider from './components/Provider.vue'

const appStore = useAppStore()

const isReady = ref(false)
const showLaunch = ref(true)
const launchStartedAt = performance.now()
const launchMinimumMs = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 2600
const wait = (duration: number) => new Promise(resolve => window.setTimeout(resolve, duration))
const pageTransitionProps = computed(() => appStore.disablePageAnimation
  ? { css: false as const }
  : {
      enterActiveClass: 'lnl-page-enter-active',
      enterFromClass: 'lnl-page-enter-from',
      enterToClass: 'lnl-page-enter-to',
      leaveActiveClass: 'lnl-page-leave-active',
      leaveFromClass: 'lnl-page-leave-from',
      leaveToClass: 'lnl-page-leave-to',
      mode: 'out-in' as const,
    })

onMounted(async () => {
  try {
    await initApp()
    await nextTick()
    isReady.value = true
  }
  catch (error) {
    console.error('[App] Initialization failed:', error)
    isReady.value = true
  }
  finally {
    await wait(Math.max(0, launchMinimumMs - (performance.now() - launchStartedAt)))
    showLaunch.value = false
  }
})

onUnmounted(() => {
  destroyInitManager()
})
</script>

<template>
  <Provider>
    <Background />
    <LoadingCover v-if="showLaunch" />
    <Header />
    <main v-if="!appStore.loading" class="flex-1">
      <div class="lnl-shell max-w-[1440px] mx-auto">
        <RouterView v-slot="{ Component }">
          <Transition v-bind="pageTransitionProps">
            <KeepAlive :include="['HomeView']">
              <component :is="Component" />
            </KeepAlive>
          </Transition>
        </RouterView>
      </div>
    </main>
    <Footer v-if="!appStore.loading" />
    <Toaster rich-colors close-button position="top-center" />
  </Provider>
</template>
