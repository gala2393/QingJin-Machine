import { ref } from 'vue'
import { settingsApi } from '@/api'
import type { PublicInfo } from '@/types/api'

const info = ref<PublicInfo | null>(null)
let pending: Promise<void> | null = null

/** Company name, contact and website address, fetched once and shared by the login page and layout. */
export function usePublicInfo() {
  if (!info.value && !pending) {
    pending = settingsApi
      .getPublic()
      .then((data) => {
        info.value = data
      })
      .catch(() => {
        // Retry on the next call instead of caching the failure.
      })
      .finally(() => {
        pending = null
      })
  }
  return info
}
