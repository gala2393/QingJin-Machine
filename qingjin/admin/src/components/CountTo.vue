<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    target: number
    duration?: number
    separator?: string
  }>(),
  { duration: 2000, separator: ',' },
)

const display = ref(0)
let frame = 0

// easeOutExpo, the default curve of Art Design Pro's ArtCountTo
const ease = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t))

function run(from: number, to: number) {
  cancelAnimationFrame(frame)
  if (!Number.isFinite(to)) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    display.value = to
    return
  }
  const start = performance.now()
  const step = (now: number) => {
    const p = Math.min((now - start) / props.duration, 1)
    display.value = from + (to - from) * ease(p)
    if (p < 1) frame = requestAnimationFrame(step)
  }
  frame = requestAnimationFrame(step)
}

watch(
  () => props.target,
  (to, from) => run(from ?? 0, to),
  { immediate: true },
)
onBeforeUnmount(() => cancelAnimationFrame(frame))

function format(n: number) {
  const s = Math.round(n).toString()
  return props.separator ? s.replace(/\B(?=(\d{3})+(?!\d))/g, props.separator) : s
}
</script>

<template>
  <span class="count-to">{{ format(display) }}</span>
</template>

<style scoped>
.count-to {
  font-variant-numeric: tabular-nums;
}
</style>
