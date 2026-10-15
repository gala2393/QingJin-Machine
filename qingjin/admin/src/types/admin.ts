import type { MachineStatus, Role } from './api'

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: '超级管理员',
  EDITOR: '编辑',
  VIEWER: '只读',
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  SUPER_ADMIN: '全部权限，含用户与日志',
  EDITOR: '管理机型、分类、图片、设置、发布',
  VIEWER: '只能查看',
}

export const ROLE_TAG: Record<Role, 'danger' | 'primary' | 'info'> = {
  SUPER_ADMIN: 'danger',
  EDITOR: 'primary',
  VIEWER: 'info',
}

export const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/

export interface AdminUser {
  id: string
  username: string
  displayName: string
  role: Role
  active: boolean
  lastLoginAt: string | null
  createdAt: string
}

export interface CreateUserInput {
  username: string
  displayName: string
  role: Role
  password: string
}

export interface UpdateUserInput {
  displayName?: string
  role?: Role
  active?: boolean
}

export interface AuditUser {
  id: string
  username: string
  displayName: string
}

export interface AuditLogItem {
  id: string
  createdAt: string
  user: AuditUser | null
  action: string
  entity: string
  entityId: string | null
  diff: unknown
  ip: string | null
}

export interface AuditLogList {
  total: number
  items: AuditLogItem[]
}

export interface AuditLogQuery {
  page: number
  pageSize: number
  userId?: string
  entity?: string
  action?: string
  from?: string
  to?: string
  q?: string
}

export interface AuditFacets {
  entities: string[]
  actions: string[]
  users: AuditUser[]
}

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  machine: '机型',
  category: '分类',
  media: '图片',
  release: '发布',
  site: '站点设置',
  user: '用户',
  auth: '登录',
  import: '导入',
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  create: '新增',
  update: '修改',
  delete: '删除',
  duplicate: '复制',
  batch: '批量操作',
  reorder: '排序',
  upload: '上传',
  publish: '发布',
  rollback: '回滚',
  login: '登录',
  login_failed: '登录失败',
  refresh_token_reuse: '令牌异常',
  password_change: '修改密码',
  password_reset: '重置密码',
  import: '导入',
}

export interface ExcelExportQuery {
  categoryId?: string
  status?: MachineStatus
}

export interface ImportError {
  sheet: string
  row: number
  message: string
}

export interface ImportResult {
  dryRun: boolean
  applied: boolean
  errors: ImportError[]
  created: { slug: string; model: string }[]
  updated: { slug: string; model: string; fields: string[] }[]
  unchanged: number
}

export type BackupFileType = 'database' | 'uploads'

export interface BackupFile {
  name: string
  type: BackupFileType
  size: number
  createdAt: string
}

export interface BackupStatus {
  enabled: boolean
  schedule: string
  keep: number
  requestPending: boolean
  files: BackupFile[]
  log: string
}
