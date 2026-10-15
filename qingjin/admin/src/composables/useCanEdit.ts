import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

/** True when the current user may call write endpoints (VIEWER is read-only). */
export function useCanEdit() {
  const auth = useAuthStore()
  return computed(() => auth.hasRole('SUPER_ADMIN', 'EDITOR'))
}
