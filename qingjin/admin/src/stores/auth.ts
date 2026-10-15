import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { authApi } from '@/api'
import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from '@/api/tokens'
import type { AuthResponse, LoginRequest, Role, User } from '@/types/api'

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(getAccessToken())
  const user = ref<User | null>(null)

  const isLoggedIn = computed(() => !!accessToken.value)

  function applyAuth(auth: AuthResponse) {
    saveTokens(auth.accessToken, auth.refreshToken)
    accessToken.value = auth.accessToken
    user.value = auth.user
  }

  function clear() {
    clearTokens()
    accessToken.value = null
    user.value = null
  }

  async function login(body: LoginRequest) {
    applyAuth(await authApi.login(body))
  }

  async function fetchMe() {
    user.value = await authApi.me()
    return user.value
  }

  async function logout() {
    const refreshToken = getRefreshToken()
    clear()
    if (refreshToken) await authApi.logout(refreshToken).catch(() => undefined)
  }

  function hasRole(...roles: Role[]) {
    return !!user.value && roles.includes(user.value.role)
  }

  return { accessToken, user, isLoggedIn, applyAuth, clear, login, fetchMe, logout, hasRole }
})
