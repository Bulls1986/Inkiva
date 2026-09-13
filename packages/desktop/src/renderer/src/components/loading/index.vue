<template>
  <div
    v-if="isVisible"
    class="cpt-loading"
    role="status"
    aria-live="polite"
    :aria-label="label"
  >
    <div
      class="loader"
      aria-hidden="true"
    >
      <span
        v-for="i in 3"
        :key="i"
        :style="dotSize"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    size?: number
    delay?: number
    label?: string
  }>(),
  {
    size: 4,
    delay: 500,
    label: 'Loading'
  }
)

const dotSize = computed(() => {
  const size = `${props.size}px`
  return {
    width: size,
    height: size
  }
})

const isVisible = ref(props.delay <= 0)
let revealTimer: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  if (isVisible.value) return
  revealTimer = setTimeout(() => {
    isVisible.value = true
    revealTimer = null
  }, props.delay)
})

onBeforeUnmount(() => {
  if (revealTimer) {
    clearTimeout(revealTimer)
    revealTimer = null
  }
})
</script>

<style scoped>
.cpt-loading {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 32px;
  box-sizing: border-box;
  color: var(--icon-secondary);
}
.loader {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1, 4px);
  min-height: 8px;
}

.loader span {
  display: block;
  flex: 0 0 auto;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.35;
  animation: inkiva-loading-dot var(--motion-loading, 900ms) ease-in-out infinite;
}

.loader span:nth-child(2) {
  animation-delay: 120ms;
}

.loader span:nth-child(3) {
  animation-delay: 240ms;
}

@keyframes inkiva-loading-dot {
  0%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }

  50% {
    opacity: 1;
    transform: translateY(-2px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .loader span {
    animation: none;
    opacity: 0.6;
    transform: none;
  }
}
</style>
