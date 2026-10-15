import axios, { type AxiosResponse } from 'axios'
import { ElMessage } from 'element-plus'
import { extractErrorMessage, http } from './http'
import type { Category } from '@/types/api'
import type {
  AdminUser,
  AuditFacets,
  AuditLogList,
  AuditLogQuery,
  BackupStatus,
  CreateUserInput,
  ExcelExportQuery,
  ImportResult,
  UpdateUserInput,
} from '@/types/admin'

function filenameFromDisposition(header: unknown, fallback: string): string {
  if (typeof header !== 'string' || !header) return fallback
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)?''([^;]+)/i.exec(header)
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''))
    } catch {
      // Malformed percent-encoding; fall through to the plain filename.
    }
  }
  const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/i.exec(header)
  const name = plain ? (plain[2] ?? plain[1]).trim() : ''
  return name || fallback
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * With responseType 'blob' the error body is a Blob too, so the global interceptor cannot read the
 * server message; requests are sent silent and the JSON error body is decoded here instead.
 */
async function download(url: string, fallbackName: string, params?: object): Promise<void> {
  let res: AxiosResponse<Blob>
  try {
    res = await http.get<Blob>(url, { params, responseType: 'blob', timeout: 0, silent: true })
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) throw error
    let message = extractErrorMessage(error)
    const data: unknown = axios.isAxiosError(error) ? error.response?.data : undefined
    if (data instanceof Blob) {
      try {
        const body = JSON.parse(await data.text()) as { message?: string | string[] }
        if (Array.isArray(body.message) && body.message.length) message = body.message.join('；')
        else if (typeof body.message === 'string' && body.message) message = body.message
      } catch {
        // Not JSON; keep the generic message.
      }
    }
    ElMessage.error(message)
    throw error
  }
  saveBlob(res.data, filenameFromDisposition(res.headers['content-disposition'], fallbackName))
}

function today(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

export const usersApi = {
  list: () => http.get<AdminUser[]>('/users').then((r) => r.data),
  create: (body: CreateUserInput) => http.post<AdminUser>('/users', body).then((r) => r.data),
  update: (id: string, body: UpdateUserInput) => http.patch<AdminUser>(`/users/${id}`, body).then((r) => r.data),
  resetPassword: (id: string, password: string) => http.post<void>(`/users/${id}/password`, { password }),
  remove: (id: string) => http.delete<void>(`/users/${id}`),
}

export const auditApi = {
  list: (query: AuditLogQuery) => http.get<AuditLogList>('/audit-logs', { params: query }).then((r) => r.data),
  facets: () => http.get<AuditFacets>('/audit-logs/facets').then((r) => r.data),
}

export const excelApi = {
  categories: () => http.get<Category[]>('/categories').then((r) => r.data),
  exportMachines: (query: ExcelExportQuery) => download('/excel/machines', `机型-${today()}.xlsx`, query),
  importMachines: (file: File, dryRun: boolean) => {
    const form = new FormData()
    form.append('file', file)
    return http
      .post<ImportResult>('/excel/machines/import', form, { params: { dryRun }, timeout: 0 })
      .then((r) => r.data)
  },
}

export const backupsApi = {
  status: (silent = false) => http.get<BackupStatus>('/backups', { silent }).then((r) => r.data),
  run: () => http.post<{ requestPending: boolean }>('/backups/run').then((r) => r.data),
  download: (name: string) => download(`/backups/${encodeURIComponent(name)}`, name),
}
