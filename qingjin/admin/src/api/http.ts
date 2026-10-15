import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'
import type { ApiError, AuthResponse } from '@/types/api'
import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from './tokens'

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Suppress the global error toast for this request. */
    silent?: boolean
    /** Skip the refresh-and-retry flow (used by the auth endpoints themselves). */
    skipAuthRefresh?: boolean
  }
}

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean
}

interface HttpHooks {
  onRefreshed?: (auth: AuthResponse) => void
  onUnauthorized?: () => void
}

let hooks: HttpHooks = {}

/** Wired from main.ts so this module does not import the store or router (avoids import cycles). */
export function configureHttp(next: HttpHooks): void {
  hooks = next
}

export const http = axios.create({
  baseURL: '/api',
  timeout: 20000,
})

http.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let refreshing: Promise<string> | null = null

function refreshAccessToken(): Promise<string> {
  if (!refreshing) {
    const refreshToken = getRefreshToken()
    refreshing = (
      refreshToken
        ? axios.post<AuthResponse>('/api/auth/refresh', { refreshToken }).then(({ data }) => {
            saveTokens(data.accessToken, data.refreshToken)
            hooks.onRefreshed?.(data)
            return data.accessToken
          })
        : Promise.reject(new Error('no refresh token'))
    ).finally(() => {
      refreshing = null
    })
  }
  return refreshing
}

let unauthorizedNotified = false

function handleUnauthorized(): void {
  clearTokens()
  if (!unauthorizedNotified) {
    unauthorizedNotified = true
    ElMessage.warning('登录已过期，请重新登录')
    setTimeout(() => (unauthorizedNotified = false), 1500)
  }
  hooks.onUnauthorized?.()
}

const STATUS_FALLBACK: Record<number, string> = {
  400: '请求参数有误',
  401: '未登录或登录已过期',
  403: '没有权限执行此操作',
  404: '请求的资源不存在',
  409: '数据冲突，请刷新后重试',
  429: '请求过于频繁，请稍后再试',
  500: '服务器内部错误',
}

export function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError<ApiError>(error)) {
    if (!error.response) {
      return error.code === 'ECONNABORTED' ? '请求超时，请稍后重试' : '网络异常，无法连接服务器'
    }
    const { status, data } = error.response
    const message = data?.message
    if (Array.isArray(message) && message.length) return message.join('；')
    if (typeof message === 'string' && message) return message
    return STATUS_FALLBACK[status] ?? `请求失败（${status}）`
  }
  return error instanceof Error ? error.message : '未知错误'
}

http.interceptors.response.use(undefined, async (error: AxiosError<ApiError>) => {
  const config = error.config as RetriableConfig | undefined

  if (error.response?.status === 401 && config && !config.skipAuthRefresh) {
    if (!config._retried && getRefreshToken()) {
      config._retried = true
      try {
        const token = await refreshAccessToken()
        config.headers.Authorization = `Bearer ${token}`
        return http(config)
      } catch {
        handleUnauthorized()
        return Promise.reject(error)
      }
    }
    handleUnauthorized()
    return Promise.reject(error)
  }

  if (!config?.silent) ElMessage.error(extractErrorMessage(error))
  return Promise.reject(error)
})
