<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter, type LocationQuery } from 'vue-router'
import { Refresh, Search } from '@element-plus/icons-vue'
import { auditApi } from '@/api/admin'
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_LABELS,
  type AuditFacets,
  type AuditLogItem,
  type AuditLogQuery,
} from '@/types/admin'
import { formatTime } from '@/utils/format'

type TagType = 'primary' | 'success' | 'warning' | 'danger' | 'info'

const ACTION_TAG: Record<string, TagType> = {
  create: 'success',
  duplicate: 'success',
  upload: 'success',
  import: 'success',
  update: 'primary',
  reorder: 'primary',
  batch: 'warning',
  publish: 'warning',
  rollback: 'warning',
  password_change: 'warning',
  password_reset: 'warning',
  delete: 'danger',
  login_failed: 'danger',
  refresh_token_reuse: 'danger',
  login: 'info',
}

const entityLabel = (v: string) => AUDIT_ENTITY_LABELS[v] ?? v
const actionLabel = (v: string) => AUDIT_ACTION_LABELS[v] ?? v
const actionTag = (v: string): TagType => ACTION_TAG[v] ?? 'info'

const route = useRoute()
const router = useRouter()

const facets = ref<AuditFacets>({ entities: [], actions: [], users: [] })
const items = ref<AuditLogItem[]>([])
const total = ref(0)
const loading = ref(false)

const filters = reactive({
  from: '',
  to: '',
  userId: '',
  entity: '',
  action: '',
  q: '',
})
const page = ref(1)
const pageSize = ref(20)

const range = computed<[string, string] | null>({
  get: () => (filters.from && filters.to ? ([filters.from, filters.to] as [string, string]) : null),
  set: (v: [string, string] | null) => {
    filters.from = v?.[0] ?? ''
    filters.to = v?.[1] ?? ''
  },
})

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function str(v: LocationQuery[string]): string {
  const s = Array.isArray(v) ? v[0] : v
  return typeof s === 'string' ? s : ''
}

function readQuery(q: LocationQuery) {
  const from = str(q.from)
  const to = str(q.to)
  filters.from = DATE_RE.test(from) ? from : ''
  filters.to = DATE_RE.test(to) ? to : ''
  filters.userId = str(q.userId)
  filters.entity = str(q.entity)
  filters.action = str(q.action)
  filters.q = str(q.q)
  const p = Number.parseInt(str(q.page), 10)
  page.value = Number.isFinite(p) && p > 0 ? p : 1
  const ps = Number.parseInt(str(q.pageSize), 10)
  pageSize.value = [10, 20, 50, 100].includes(ps) ? ps : 20
}

function buildQuery(): AuditLogQuery {
  const q: AuditLogQuery = { page: page.value, pageSize: pageSize.value }
  if (filters.from) q.from = filters.from
  if (filters.to) q.to = filters.to
  if (filters.userId) q.userId = filters.userId
  if (filters.entity) q.entity = filters.entity
  if (filters.action) q.action = filters.action
  const kw = filters.q.trim()
  if (kw) q.q = kw
  return q
}

function syncUrl() {
  const q = buildQuery()
  const query: Record<string, string> = {}
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === '') continue
    if ((k === 'page' && v === 1) || (k === 'pageSize' && v === 20)) continue
    query[k] = String(v)
  }
  const current = route.query
  const same =
    Object.keys(query).length === Object.keys(current).length &&
    Object.entries(query).every(([k, v]) => str(current[k]) === v)
  // Replacing with an identical query fires no watcher, so reload directly (e.g. "查询" pressed again).
  if (same) load()
  else router.replace({ query })
}

async function load() {
  loading.value = true
  try {
    const data = await auditApi.list(buildQuery())
    items.value = data.items
    total.value = data.total
  } catch {
    // Error toast comes from the http interceptor.
  } finally {
    loading.value = false
  }
}

function search() {
  page.value = 1
  syncUrl()
}

function reset() {
  Object.assign(filters, { from: '', to: '', userId: '', entity: '', action: '', q: '' })
  search()
}

function onPageChange() {
  syncUrl()
}

function onSizeChange() {
  page.value = 1
  syncUrl()
}

// The URL is the source of truth: filter changes write the query, and every query change reloads.
watch(
  () => route.query,
  (q) => {
    if (route.name !== 'audit-logs') return
    readQuery(q)
    load()
  },
)

// ---------- detail drawer ----------

const detailOpen = ref(false)
const detail = ref<AuditLogItem | null>(null)

function openDetail(row: AuditLogItem) {
  detail.value = row
  detailOpen.value = true
}

function prettyDiff(diff: unknown): string {
  if (diff === null || diff === undefined) return '（无）'
  if (typeof diff === 'string') {
    try {
      return JSON.stringify(JSON.parse(diff), null, 2)
    } catch {
      return diff
    }
  }
  try {
    return JSON.stringify(diff, null, 2)
  } catch {
    return String(diff)
  }
}

function hasDiff(diff: unknown): boolean {
  if (diff === null || diff === undefined || diff === '') return false
  if (typeof diff === 'object') return Object.keys(diff as object).length > 0
  return true
}

function userText(row: AuditLogItem): string {
  if (row.user) return row.user.displayName || row.user.username
  return ''
}

/**
 * The API returns user=null both for deleted accounts and for events with no logged-in actor,
 * so the label is a best guess: failed logins have no actor, rows without an IP came from the server itself.
 */
function anonymousUserText(row: AuditLogItem): string {
  if (row.action === 'login_failed' || row.action === 'refresh_token_reuse') return '未识别用户'
  if (!row.ip) return '系统'
  return '已删除用户'
}

const narrowQuery = window.matchMedia('(max-width: 768px)')
const narrow = ref(narrowQuery.matches)
const onNarrowChange = (e: MediaQueryListEvent) => (narrow.value = e.matches)

onMounted(() => {
  narrowQuery.addEventListener('change', onNarrowChange)
  readQuery(route.query)
  load()
  auditApi
    .facets()
    .then((f) => (facets.value = f))
    .catch(() => undefined)
})
onBeforeUnmount(() => narrowQuery.removeEventListener('change', onNarrowChange))
</script>

<template>
  <div class="page-card">
    <div class="page-toolbar">
      <!-- The daterange panel is ~650px wide, so phones get two single-date pickers instead. -->
      <div v-if="narrow" class="filter-dates">
        <el-date-picker
          v-model="filters.from"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="开始日期"
          :editable="false"
          @change="search"
        />
        <span class="muted">至</span>
        <el-date-picker
          v-model="filters.to"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="结束日期"
          :editable="false"
          @change="search"
        />
      </div>
      <el-date-picker
        v-else
        v-model="range"
        type="daterange"
        value-format="YYYY-MM-DD"
        range-separator="至"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        class="filter-range"
        @change="search"
      />
      <el-select v-model="filters.userId" placeholder="全部用户" clearable filterable class="filter-select" @change="search">
        <el-option
          v-for="u in facets.users"
          :key="u.id"
          :label="`${u.displayName}（${u.username}）`"
          :value="u.id"
        />
      </el-select>
      <el-select v-model="filters.entity" placeholder="全部对象类型" clearable class="filter-select" @change="search">
        <el-option v-for="e in facets.entities" :key="e" :label="entityLabel(e)" :value="e" />
      </el-select>
      <el-select v-model="filters.action" placeholder="全部操作" clearable class="filter-select" @change="search">
        <el-option v-for="a in facets.actions" :key="a" :label="actionLabel(a)" :value="a" />
      </el-select>
      <el-input
        v-model="filters.q"
        placeholder="对象 ID / 用户名"
        :prefix-icon="Search"
        clearable
        class="filter-q"
        @keyup.enter="search"
        @clear="search"
      />
      <el-button type="primary" @click="search">查询</el-button>
      <el-button @click="reset">重置</el-button>
      <span class="spacer" />
      <el-button :icon="Refresh" :disabled="loading" @click="load">刷新</el-button>
    </div>

    <el-table v-loading="loading" :data="items" row-key="id" border style="width: 100%">
      <el-table-column type="expand" width="40">
        <template #default="{ row }">
          <div class="expand">
            <pre v-if="hasDiff(row.diff)" class="code">{{ prettyDiff(row.diff) }}</pre>
            <span v-else class="muted">无详细内容</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="时间" width="150">
        <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="用户" min-width="130" show-overflow-tooltip>
        <template #default="{ row }">
          <template v-if="row.user">
            {{ userText(row as AuditLogItem) }}
            <span v-if="row.user.displayName && row.user.displayName !== row.user.username" class="muted">
              {{ row.user.username }}
            </span>
          </template>
          <span v-else class="muted">{{ anonymousUserText(row as AuditLogItem) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="110" align="center">
        <template #default="{ row }">
          <el-tag :type="actionTag(row.action)" size="small">{{ actionLabel(row.action) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="对象" width="100">
        <template #default="{ row }">{{ entityLabel(row.entity) }}</template>
      </el-table-column>
      <el-table-column label="对象ID" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">
          <router-link v-if="row.entity === 'machine' && row.entityId" :to="`/machines/${row.entityId}`" class="link">
            {{ row.entityId }}
          </router-link>
          <span v-else-if="row.entityId" class="mono">{{ row.entityId }}</span>
          <span v-else class="muted">-</span>
        </template>
      </el-table-column>
      <el-table-column label="IP" width="130">
        <template #default="{ row }"><span class="mono">{{ row.ip || '-' }}</span></template>
      </el-table-column>
      <el-table-column label="" width="70" :fixed="narrow ? false : 'right'" align="center">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDetail(row as AuditLogItem)">详情</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        background
        @current-change="onPageChange"
        @size-change="onSizeChange"
      />
    </div>

    <el-drawer v-model="detailOpen" title="日志详情" size="min(640px, 100vw)" append-to-body>
      <template v-if="detail">
        <el-descriptions :column="1" border size="small" class="block">
          <el-descriptions-item label="时间">{{ formatTime(detail.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="用户">
            <template v-if="detail.user">{{ detail.user.displayName }}（{{ detail.user.username }}）</template>
            <span v-else class="muted">{{ anonymousUserText(detail) }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="操作">
            <el-tag :type="actionTag(detail.action)" size="small">{{ actionLabel(detail.action) }}</el-tag>
            <span v-if="AUDIT_ACTION_LABELS[detail.action]" class="muted raw">{{ detail.action }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="对象">
            {{ entityLabel(detail.entity) }}
            <span v-if="AUDIT_ENTITY_LABELS[detail.entity]" class="muted raw">{{ detail.entity }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="对象ID">
            <router-link
              v-if="detail.entity === 'machine' && detail.entityId"
              :to="`/machines/${detail.entityId}`"
              class="link"
              @click="detailOpen = false"
            >
              {{ detail.entityId }}
            </router-link>
            <span v-else class="mono">{{ detail.entityId || '-' }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="IP"><span class="mono">{{ detail.ip || '-' }}</span></el-descriptions-item>
        </el-descriptions>
        <h3 class="sub-title">变更内容</h3>
        <pre class="code">{{ prettyDiff(detail.diff) }}</pre>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.filter-range {
  width: 260px;
  flex: 0 0 auto;
}

.filter-select {
  width: 150px;
}

.filter-q {
  width: 200px;
}

.muted {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.raw {
  margin-left: 6px;
}

.mono {
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12px;
}

.link {
  color: var(--el-color-primary);
  text-decoration: none;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12px;
}

.expand {
  padding: 8px 16px;
}

.block {
  margin-bottom: 16px;
}

.sub-title {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
}

.code {
  margin: 0;
  max-height: 60vh;
  overflow: auto;
  padding: 12px;
  border-radius: 6px;
  background: #1e1e1e;
  color: #d4d4d4;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
  overflow-x: auto;
}

@media (max-width: 768px) {
  .filter-range,
  .filter-select,
  .filter-q {
    width: 100%;
  }

  .filter-dates {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
  }

  .filter-dates :deep(.el-date-editor) {
    flex: 1 1 0;
    min-width: 0;
    width: auto;
  }

  .pager :deep(.el-pagination__sizes) {
    display: none;
  }
}
</style>
