import type { AxiosProgressEvent } from 'axios'
import { http } from './http'
import type {
  AuthResponse,
  Category,
  CategoryInput,
  LoginRequest,
  MachineBatchAction,
  MachineDetail,
  MachineInput,
  MachineListItem,
  MachineListQuery,
  MachineVideo,
  MediaItem,
  MediaListQuery,
  MediaUploadOptions,
  MediaUsageRef,
  Paginated,
  ParamTemplate,
  ParamTemplateInput,
  PendingChanges,
  PublicInfo,
  PreviewState,
  Release,
  ReleaseDetail,
  ReleaseList,
  ChangePasswordRequest,
  SiteSettings,
  SiteSettingsResponse,
  StatsOverview,
  StatsSummary,
  User,
} from '@/types/api'

export const authApi = {
  login: (body: LoginRequest) =>
    http.post<AuthResponse>('/auth/login', body, { skipAuthRefresh: true }).then((r) => r.data),
  logout: (refreshToken: string) =>
    http.post<void>('/auth/logout', { refreshToken }, { skipAuthRefresh: true, silent: true }),
  me: () => http.get<User>('/auth/me').then((r) => r.data),
  changePassword: (body: ChangePasswordRequest) => http.post<void>('/auth/password', body),
}

export const settingsApi = {
  getSite: () => http.get<SiteSettingsResponse>('/settings/site').then((r) => r.data),
  getPublic: () =>
    http.get<PublicInfo>('/settings/public', { silent: true }).then((r) => r.data),
  saveSite: (body: SiteSettings) => http.put<SiteSettingsResponse>('/settings/site', body).then((r) => r.data),
}

export const statsApi = {
  summary: (silent = false) => http.get<StatsSummary>('/stats/summary', { silent }).then((r) => r.data),
  overview: (range?: { from: string; to: string }) =>
    http.get<StatsOverview>('/stats/overview', { params: range }).then((r) => r.data),
}

export const categoryApi = {
  list: () => http.get<Category[]>('/categories').then((r) => r.data),
  create: (body: CategoryInput) => http.post<Category>('/categories', body).then((r) => r.data),
  update: (id: string, body: Partial<CategoryInput>) =>
    http.patch<Category>(`/categories/${id}`, body).then((r) => r.data),
  remove: (id: string) => http.delete<void>(`/categories/${id}`),
  reorder: (ids: string[]) => http.put<void>('/categories/order', { ids }),
  templates: (id: string) => http.get<ParamTemplate[]>(`/categories/${id}/templates`).then((r) => r.data),
  saveTemplates: (id: string, items: ParamTemplateInput[]) =>
    http.put<ParamTemplate[]>(`/categories/${id}/templates`, { items }).then((r) => r.data),
}

export const machineApi = {
  list: (query: MachineListQuery) =>
    http.get<Paginated<MachineListItem>>('/machines', { params: query }).then((r) => r.data),
  slugAvailable: (slug: string, excludeId?: string) =>
    http
      .get<{ available: boolean }>('/machines/slug-available', { params: { slug, excludeId }, silent: true })
      .then((r) => r.data.available),
  get: (id: string) => http.get<MachineDetail>(`/machines/${id}`).then((r) => r.data),
  create: (body: MachineInput) => http.post<MachineDetail>('/machines', body).then((r) => r.data),
  update: (id: string, body: MachineInput) => http.put<MachineDetail>(`/machines/${id}`, body).then((r) => r.data),
  remove: (id: string) => http.delete<void>(`/machines/${id}`),
  duplicate: (id: string) => http.post<MachineDetail>(`/machines/${id}/duplicate`).then((r) => r.data),
  batch: (ids: string[], action: MachineBatchAction) =>
    http.post<{ count: number }>('/machines/batch', { ids, action }).then((r) => r.data),
  reorder: (categoryId: string, ids: string[]) => http.put<void>('/machines/order', { categoryId, ids }),
}

export const mediaApi = {
  list: (query: MediaListQuery) => http.get<Paginated<MediaItem>>('/media', { params: query }).then((r) => r.data),
  usages: (id: string) => http.get<MediaUsageRef[]>(`/media/${id}/usages`).then((r) => r.data),
  remove: (id: string) => http.delete<void>(`/media/${id}`),
  upload: (file: File, options: MediaUploadOptions = {}, onProgress?: (percent: number) => void) => {
    const form = new FormData()
    form.append('file', file)
    if (options.crop) form.append('crop', JSON.stringify(options.crop))
    if (options.square !== undefined) form.append('square', String(options.square))
    if (options.usage) form.append('usage', options.usage)
    return http
      .post<MediaItem>('/media', form, {
        timeout: 0,
        onUploadProgress: (e: AxiosProgressEvent) => {
          if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
        },
      })
      .then((r) => r.data)
  },
}

/** Chunked, resumable video upload; see the server's VideosController. */
export const videoApi = {
  create: (body: { fileName: string; size: number; mime?: string }) =>
    http.post<MachineVideo>('/videos', body).then((r) => r.data),
  get: (id: string, silent = false) => http.get<MachineVideo>(`/videos/${id}`, { silent }).then((r) => r.data),
  uploadChunk: (id: string, index: number, chunk: Blob, signal: AbortSignal, onProgress?: (loaded: number) => void) =>
    http.put<void>(`/videos/${id}/chunks/${index}`, chunk, {
      headers: { 'Content-Type': 'application/octet-stream' },
      timeout: 0,
      silent: true,
      signal,
      onUploadProgress: (e: AxiosProgressEvent) => onProgress?.(e.loaded),
    }),
  complete: (id: string) => http.post<MachineVideo>(`/videos/${id}/complete`, undefined, { timeout: 120000 }).then((r) => r.data),
  remove: (id: string, silent = false) => http.delete<void>(`/videos/${id}`, { silent }),
}

/** `silent` suppresses error toasts, used by background polling. */
export const releaseApi = {
  pending: (silent = false) => http.get<PendingChanges>('/releases/pending', { silent }).then((r) => r.data),
  list: (page: number, pageSize: number, silent = false) =>
    http.get<ReleaseList>('/releases', { params: { page, pageSize }, silent }).then((r) => r.data),
  get: (id: string, silent = false) => http.get<ReleaseDetail>(`/releases/${id}`, { silent }).then((r) => r.data),
  publish: (note?: string) => http.post<Release>('/releases', { note }).then((r) => r.data),
  rollback: (id: string, note?: string) => http.post<Release>(`/releases/${id}/rollback`, { note }).then((r) => r.data),
  preview: (silent = false) => http.get<PreviewState>('/releases/preview', { silent }).then((r) => r.data),
  buildPreview: () => http.post<PreviewState>('/releases/preview').then((r) => r.data),
  previewLink: () => http.post<{ url: string; expiresIn: number }>('/releases/preview/link').then((r) => r.data),
}
