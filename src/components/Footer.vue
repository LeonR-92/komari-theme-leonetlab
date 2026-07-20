<script setup lang="ts">
import type { VersionInfo } from '@/utils/api'
import { computed, onMounted, ref } from 'vue'
import VisitorInfoCard from '@/components/VisitorInfoCard.vue'
import { useAppStore } from '@/stores/app'
import { getSharedApi } from '@/utils/api'

const appStore = useAppStore()
const serverVersion = ref<VersionInfo | null>(null)
const showIcp = computed(() => appStore.icpEnabled && appStore.icpNumber)
const showPolice = computed(() => appStore.policeEnabled && appStore.policeNumber)
const showFiling = computed(() => showIcp.value || showPolice.value)

onMounted(async () => {
  try {
    serverVersion.value = await getSharedApi().getVersion()
  }
  catch {
    // Version text is supplementary.
  }
})
</script>

<template>
  <VisitorInfoCard v-if="appStore.visitorInfoCardEnabled" />
  <footer class="lnl-footer max-w-[1440px] mx-auto">
    <div class="lnl-footer-rule">
      <span>EDGE / OBSERVATION COMPLETE</span><i />
    </div>
    <div class="lnl-footer-meta">
      <p>
        <a href="https://github.com/komari-monitor/komari" target="_blank" rel="noopener noreferrer">Powered by Komari Monitor.</a>
        <span v-if="serverVersion?.version">{{ serverVersion.version }}</span>
      </p>
      <p>
        LeoNetLab Observatory · based on
        <a href="https://github.com/Tokinx/komari-theme-emerald" target="_blank" rel="noopener noreferrer">Komari Emerald</a>
      </p>
    </div>
    <div v-if="showFiling" class="lnl-filing">
      <a v-if="showIcp" :href="appStore.icpUrl" target="_blank" rel="noopener noreferrer">{{ appStore.icpNumber }}</a>
      <span v-if="showIcp && showPolice">/</span>
      <a v-if="showPolice && appStore.policeUrl" :href="appStore.policeUrl" target="_blank" rel="noopener noreferrer">{{ appStore.policeNumber }}</a>
      <span v-else-if="showPolice">{{ appStore.policeNumber }}</span>
    </div>
  </footer>
</template>
