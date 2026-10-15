import { ref } from 'vue'
import { statsApi } from '@/api'
import type { StatsSummary } from '@/types/api'

const MIN_INTERVAL_MS = 5_000

const summary = ref<StatsSummary | null>(null)
let lastFetch = 0
let inflight: Promise<void> | null = null

/** Sidebar to-do badges (unpublished machines, unreleased changes). Shared so pages can force a refresh. */
export function refreshNavStatus(force = false): Promise<void> {
  if (inflight) return inflight
  if (!force && Date.now() - lastFetch < MIN_INTERVAL_MS) return Promise.resolve()
  lastFetch = Date.now()
  inflight = statsApi
    .summary(true)
    .then((data) => {
      summary.value = data
    })
    .catch(() => {
      // Badges are best-effort; keep the last known values.
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

export function useNavStatus() {
  return summary
}
