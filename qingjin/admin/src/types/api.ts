export type Role = 'SUPER_ADMIN' | 'EDITOR' | 'VIEWER'

export interface User {
  id: string
  username: string
  displayName: string
  role: Role
}

export interface LoginRequest {
  username: string
  password: string
}

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  user: User
}

export interface Category {
  id: string
  slug: string
  nameZh: string
  nameEn: string
  icon: string | null
  sort: number
  machineCount: number
}

export interface CategoryInput {
  slug: string
  nameZh: string
  nameEn: string
  icon?: string
}

export interface ParamTemplate {
  id: string
  key: string
  labelZh: string
  labelEn: string
  sort: number
}

export interface ParamTemplateInput {
  key: string
  labelZh: string
  labelEn: string
}

export type MachineStatus = 'DRAFT' | 'PUBLISHED' | 'HIDDEN'

export interface MachineListItem {
  id: string
  slug: string
  model: string
  nameZh: string
  nameEn: string
  status: MachineStatus
  featured: boolean
  sort: number
  category: Pick<Category, 'id' | 'slug' | 'nameZh'>
  coverUrl: string | null
  paramCount: number
  updatedAt: string
}

export interface MachineListQuery {
  page?: number
  pageSize?: number
  q?: string
  categoryId?: string
  status?: MachineStatus
  featured?: boolean
  /** 'pending' lists drafts and hidden machines first. */
  order?: 'site' | 'pending'
}

/** Unauthenticated `/settings/public`; siteUrl is '' when the website address isn't configured. */
export interface PublicInfo {
  name: string
  phone: string
  email: string
  siteUrl: string
}

export interface MachineParam {
  key: string
  labelZh: string
  labelEn: string
  valueZh: string
  valueEn: string
}

export interface MachineImage {
  mediaId: string
  url: string
  width: number
  height: number
  isCover: boolean
}

export interface MachineDetail {
  id: string
  slug: string
  model: string
  categoryId: string
  category: Pick<Category, 'id' | 'slug' | 'nameZh' | 'nameEn'>
  nameZh: string
  nameEn: string
  summaryZh: string | null
  summaryEn: string | null
  status: MachineStatus
  featured: boolean
  sort: number
  seoTitleZh: string | null
  seoTitleEn: string | null
  seoDescZh: string | null
  seoDescEn: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  params: MachineParam[]
  images: MachineImage[]
}

export interface MachineInput {
  slug: string
  model: string
  categoryId: string
  nameZh: string
  nameEn: string
  summaryZh?: string
  summaryEn?: string
  status: MachineStatus
  featured: boolean
  seoTitleZh?: string
  seoTitleEn?: string
  seoDescZh?: string
  seoDescEn?: string
  notes?: string
  params: MachineParam[]
  images: { mediaId: string; isCover: boolean }[]
}

export type MachineBatchAction = 'publish' | 'hide' | 'draft' | 'feature' | 'unfeature' | 'delete'

export type MediaUsage = 'machine' | 'site'

export interface MediaItem {
  id: string
  url: string
  originalName: string
  width: number
  height: number
  size: number
  usage: MediaUsage
  createdAt: string
  usageCount: number
}

export interface MediaListQuery {
  page?: number
  pageSize?: number
  q?: string
  unused?: boolean
  usage?: MediaUsage
}

/** Either a machine reference or a site-settings slot such as '工厂照片'. */
export interface MediaUsageRef {
  machineId?: string
  slug?: string
  model?: string
  nameZh?: string
  site?: string
}

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export interface MediaUploadOptions {
  crop?: CropRect
  square?: boolean
  usage?: MediaUsage
}

export interface Paginated<T> {
  items: T[]
  total: number
}

export interface MachineBrief {
  slug: string
  model: string
  nameZh: string
}

export interface PendingChanges {
  hasLive: boolean
  liveVersion: number | null
  hasChanges: boolean
  machines: {
    added: MachineBrief[]
    removed: MachineBrief[]
    changed: (MachineBrief & { fields: string[] })[]
  }
  orderChanged?: boolean
  categoriesChanged: boolean
  siteChanged: boolean
}

export type ReleaseStatus = 'PENDING' | 'BUILDING' | 'SUCCESS' | 'FAILED'

export interface Release {
  id: string
  version: number
  note: string | null
  status: ReleaseStatus
  rollbackOf: number | null
  createdAt: string
  finishedAt: string | null
  createdBy: Pick<User, 'id' | 'username' | 'displayName'> | null
  isLive: boolean
}

export interface ReleaseDetail extends Release {
  log: string | null
  summary: { machines: number; categories: number; images: number }
}

export interface ReleaseList {
  total: number
  liveVersion: number | null
  items: Release[]
}

export type PreviewStatus = 'idle' | 'building' | 'ready' | 'failed'

export interface PreviewState {
  status: PreviewStatus
  builtAt: string | null
  log: string | null
  /** Shape not pinned down by the contract; either a display name or a user object. */
  startedBy: string | Pick<User, 'id' | 'username' | 'displayName'> | null
}

export const RELEASE_STATUS_LABELS: Record<ReleaseStatus, string> = {
  PENDING: '等待中',
  BUILDING: '构建中',
  SUCCESS: '成功',
  FAILED: '失败',
}

// ---------- site settings ----------

export interface Localized {
  zh: string
  en: string
}

export interface SiteImageRef {
  mediaId: string
  /** Returned by GET for display only; PUT ignores it. */
  url: string
}

export interface FactoryPhoto extends SiteImageRef {
  title: Localized
  desc: Localized
}

export interface Certificate extends SiteImageRef {
  title: Localized
  type: string
}

export interface SiteSettings {
  name: Localized
  tagline: Localized
  factoryPitch: Localized
  certPitch: Localized
  address: Localized
  contact: { phone: string; email: string; whatsapp: string; wechat: string }
  formEndpoint: string
  aboutImage: SiteImageRef | null
  wechatQr: SiteImageRef | null
  factoryPhotos: FactoryPhoto[]
  certificates: Certificate[]
}

export interface SiteSettingsResponse extends SiteSettings {
  updatedAt: string | null
}

// ---------- stats ----------

export interface StatsTotals {
  pv: number
  uv: number
  machineViews: number
  inquiries: number
  searches: number
}

export type InquiryChannel = 'form' | 'email' | 'whatsapp' | 'phone' | 'wechat'
export type DeviceType = 'desktop' | 'mobile' | 'tablet'

export interface StatsOverview {
  range: { from: string; to: string; days: number }
  totals: StatsTotals
  prevTotals: StatsTotals
  trend: { date: string; pv: number; uv: number; inquiries: number }[]
  topMachines: { slug: string; model: string | null; nameZh: string | null; views: number }[]
  topPages: { path: string; pv: number }[]
  referrers: { host: string; pv: number }[]
  countries: { code: string; pv: number }[]
  devices: { device: DeviceType; uv: number }[]
  langs: { lang: 'zh' | 'en'; pv: number }[]
  inquiryChannels: { channel: InquiryChannel; count: number }[]
  searches: { query: string; count: number }[]
  zeroResultSearches: { query: string; count: number }[]
  realtime: { pv30m: number; visitors30m: number }
  generatedAt: string
}

export interface StatsSummary {
  machines: { total: number; published: number; draft: number; hidden: number }
  categories: number
  pendingChanges: boolean
  liveVersion: number | null
  today: { pv: number; uv: number; inquiries: number }
}

export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}

export interface ApiError {
  statusCode: number
  message: string | string[]
  error?: string
}

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: '超级管理员',
  EDITOR: '编辑',
  VIEWER: '只读',
}

export const MACHINE_STATUS_LABELS: Record<MachineStatus, string> = {
  DRAFT: '草稿',
  PUBLISHED: '已发布',
  HIDDEN: '已隐藏',
}
