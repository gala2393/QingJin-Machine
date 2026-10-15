# API contract: phases 4–6

All routes are under `/api` and need `Authorization: Bearer <access token>` unless marked public.
Errors are `{ statusCode, message }`. `message` is Chinese text that can be shown to the user, or an array of strings for 400 validation errors.
Roles are `SUPER_ADMIN`, `EDITOR` and `VIEWER`. "Editor+" means SUPER_ADMIN or EDITOR.

## Phase 4: site settings

### Data shape
`SiteSettings` (bilingual text is `{ zh: string, en: string }`, abbreviated `L`):
```ts
interface SiteSettings {
  name: L            // company name, required, ≤100 each
  tagline: L         // ≤200
  factoryPitch: L    // ≤200
  certPitch: L       // ≤200
  address: L         // ≤300
  contact: { phone: string; email: string; whatsapp: string; wechat: string }  // ≤100 each, email may be '' or a valid email
  formEndpoint: string   // legacy, no longer used by the site (the inquiry form was removed); '' or an https:// URL, ≤500
  aboutImage: { mediaId: string; url: string } | null      // big picture on the About page
  wechatQr?: { mediaId: string; url: string } | null       // WeChat QR on the Contact page; null shows a placeholder
  factoryPhotos: { mediaId: string; url: string; title: L; desc: L }[]   // ≤30, title ≤100, desc ≤300
  certificates: { mediaId: string; url: string; title: L; type: string }[] // ≤30, title ≤200, type ≤50 (e.g. "CE Certificate")
}
```
`url` is returned by GET for display only. PUT ignores `url` and accepts it if present.

### Routes
- `GET /settings/site` (any role) → `SiteSettings & { updatedAt: string | null }`
- `PUT /settings/site` (Editor+), body `SiteSettings` → same shape as GET.
  - Returns 400 if a `mediaId` does not exist.
  - Changes go live only after publishing from 发布中心. Pending changes show as `siteChanged: true` in `GET /releases/pending`.
- Upload images through the existing `POST /media` with `usage=site`, and `square=false` for photos and certificates, which are not square.
  - Filter the media library with `GET /media?usage=site`.
- Media protection: `GET /media/:id/usages` now returns `{ machineId?, slug?, model?, nameZh?, site?: string }[]`.
  - Site usages look like `{ site: '工厂照片' | '证书' | '关于页大图' }`.
  - `DELETE /media/:id` returns 409 while the image is used by a machine or by the site settings.

## Phase 5: analytics

Tracking is public, `POST /track`, and is used only by the showcase site.

- `GET /stats/overview?from=YYYY-MM-DD&to=YYYY-MM-DD` (any role)
  - Dates are inclusive, in the business timezone (Asia/Shanghai). The range is at most 366 days. The default is the last 30 days including today.
  - Response:
```ts
{
  range: { from: string; to: string; days: number }
  totals:     { pv: number; uv: number; machineViews: number; inquiries: number; searches: number }
  prevTotals: { pv: number; uv: number; machineViews: number; inquiries: number; searches: number }  // the same-length period just before
  trend: { date: string; pv: number; uv: number; inquiries: number }[]   // one entry per day, zero-filled
  topMachines: { slug: string; model: string | null; nameZh: string | null; views: number }[]  // top 10
  topPages:    { path: string; pv: number }[]          // top 10
  referrers:   { host: string; pv: number }[]          // top 10, external sites; '' is excluded
  countries:   { code: string; pv: number }[]          // ISO-2 from Cloudflare, 'XX' = unknown; top 15
  devices:     { device: 'desktop' | 'mobile' | 'tablet'; uv: number }[]
  langs:       { lang: 'zh' | 'en'; pv: number }[]
  inquiryChannels: { channel: 'form' | 'email' | 'whatsapp' | 'phone' | 'wechat'; count: number }[]
  searches:          { query: string; count: number }[]  // top 15
  zeroResultSearches:{ query: string; count: number }[]  // top 15, searches that found nothing
  realtime: { pv30m: number; visitors30m: number }      // last 30 minutes
  generatedAt: string
}
```
- `uv` means visitors de-duplicated per day: there are no cookies, and the anonymous id rotates daily. A range total is the sum of the daily figures, so label it "访客（按天去重）".
- `GET /stats/summary` (any role) → `{ machines: { total, published, draft, hidden }, categories: number, pendingChanges: boolean, liveVersion: number | null, today: { pv, uv, inquiries } }`, for the dashboard cards.

## Phase 6: users, audit log, Excel, backups

### Users (SUPER_ADMIN only)
`User = { id, username, displayName, role, active, lastLoginAt: string | null, createdAt }`
- `GET /users` → `User[]`, ordered by createdAt.
- `POST /users` with `{ username, displayName, role, password }` → `User` (201).
  - `username` matches `^[a-zA-Z0-9_.-]{3,32}$`; `displayName` is 1–50 characters; `password` is 10–100 characters.
  - Returns 409 if the username is taken.
- `PATCH /users/:id` with `{ displayName?, role?, active? }` → `User`.
  - 400 if you demote or disable yourself, or if no active SUPER_ADMIN would remain.
  - Disabling a user, or changing their role, takes effect immediately and logs them out.
- `POST /users/:id/password` with `{ password }` → 204. This resets the password and logs that user out everywhere.
- `DELETE /users/:id` → 204. Returns 400 when deleting yourself or the last SUPER_ADMIN. The user's audit history is kept, with the user shown as deleted.

### Own account (any role)
- `POST /auth/password` with `{ currentPassword, newPassword }` → 204.
  - Returns 400 if `currentPassword` is wrong, or if `newPassword` has fewer than 10 characters or equals the current one.
  - Other sessions are logged out and the current refresh token stays valid. The admin may simply keep going.

### Audit log (SUPER_ADMIN only)
- `GET /audit-logs?page=1&pageSize=20&userId=&entity=&action=&from=YYYY-MM-DD&to=YYYY-MM-DD&q=`
  - `q` matches entityId or a username contained in the diff.
  - Response: `{ total, items: { id, createdAt, user: { id, username, displayName } | null, action, entity, entityId, diff: any, ip: string | null }[] }`
- `GET /audit-logs/facets` → `{ entities: string[], actions: string[], users: { id, username, displayName }[] }`, for filter dropdowns.
- Known entities and actions, with suggested Chinese labels:
  - entity: machine 机型, category 分类, media 图片, release 发布, site 站点设置, user 用户, auth 登录, import 导入
  - action: create 新增, update 修改, delete 删除, duplicate 复制, batch 批量操作, reorder 排序, upload 上传, publish 发布, rollback 回滚, login 登录, login_failed 登录失败, refresh_token_reuse 令牌异常, password_change 修改密码, password_reset 重置密码, import 导入
  - Unknown values are shown as-is.
- The `diff` shape varies. Render it as formatted JSON; for `update`, it is usually `{ field: { from, to } }` or `{ changed: [...] }`.

### Excel (machines)
- `GET /excel/machines?categoryId=&status=` (any role) → an `.xlsx` download, filename `机型-YYYYMMDD.xlsx`.
  - Sheet 「机型」: slug, 型号, 分类, 中文名称, 英文名称, 状态 (已上架/草稿/隐藏), 推荐 (是/否), 排序
  - Sheet 「参数」: slug, 参数键, 中文参数名, 英文参数名, 中文值, 英文值
  - Sheet 「分类」: the available category slugs and names
  - Sheet 「说明」: instructions
- `POST /excel/machines/import?dryRun=true|false` (Editor+), multipart field `file` (.xlsx, ≤10 MB) →
```ts
{
  dryRun: boolean
  applied: boolean            // true only when dryRun=false and there were no errors
  errors: { sheet: string; row: number; message: string }[]    // row = Excel row number
  created: { slug: string; model: string }[]
  updated: { slug: string; model: string; fields: string[] }[]  // fields in Chinese, e.g. 名称, 分类, 状态, 推荐, 排序, 参数
  unchanged: number
}
```
  - Rules:
    - Matching is by slug.
    - Rows are never deleted.
    - The params of a machine are replaced only when that slug has rows in 「参数」.
    - Images are not handled; set them in the editor.
    - New machines get no cover.
  - Run with dryRun=true first to show the preview, then with dryRun=false to apply. Nothing is written if there is any error.

### Backups (SUPER_ADMIN only)
In production, a `backup` container writes daily `pg_dump` files and an uploads archive to a shared folder.
- `GET /backups` → `{ enabled: boolean, schedule: string, keep: number, requestPending: boolean, files: { name, type: 'database' | 'uploads', size, createdAt }[], log: string }`
  - `enabled` is false when no backup folder is configured; then show a hint.
  - `log` is the last ~50 lines of the backup log.
- `POST /backups/run` → 202 `{ requestPending: true }`. The backup container starts within about 30 seconds. Returns 409 if a backup is already pending.
- `GET /backups/:name` → file download, `application/octet-stream`.
