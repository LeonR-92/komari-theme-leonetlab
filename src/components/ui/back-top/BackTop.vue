<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

interface Props {
  visibilityHeight?: number
}

const props = withDefaults(defineProps<Props>(), {
  visibilityHeight: 1,
})

const emit = defineEmits<{
  scrolled: [boolean]
}>()

const show = ref(false)
let scrollFrame = 0

function handleScroll() {
  if (scrollFrame)
    return
  scrollFrame = window.requestAnimationFrame(() => {
    scrollFrame = 0
    const scrolled = window.scrollY > props.visibilityHeight
    if (show.value === scrolled)
      return
    show.value = scrolled
    emit('scrolled', scrolled)
  })
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll, { passive: true })
  handleScroll()
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
  if (scrollFrame)
    window.cancelAnimationFrame(scrollFrame)
})
</script>

<template>
  <Transition
    enter-active-class="transition-[opacity,transform] duration-200 motion-reduce:transition-none"
    enter-from-class="opacity-0 translate-y-2"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition-[opacity,transform] duration-200 motion-reduce:transition-none"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 translate-y-2"
  >
    <button
      v-show="show"
      class="lnl-back-top fixed bottom-8 right-8 z-45 size-10 rounded-full bg-background border shadow-sm flex items-center justify-center text-foreground hover:bg-accent transition-colors"
      aria-label="返回顶部"
      @click="scrollToTop"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    </button>
  </Transition>
</template>
