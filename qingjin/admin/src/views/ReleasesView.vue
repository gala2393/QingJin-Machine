<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Loading, Promotion, Refresh, View } from '@element-plus/icons-vue'
import { releaseApi } from '@/api'
import { useCanEdit } from '@/composables/useCanEdit'
import { refreshNavStatus } from '@/composables/useNavStatus'
import {
  RELEASE_STATUS_LABELS,
  type PendingChanges,
  type PreviewState,
  type Release,
  type ReleaseDetail,
  type ReleaseStatus,
} from '@/types/api'
import { formatTime } from '@/utils/format'

const POLL_MS = 2000

const STATUS_TAG: Record<ReleaseStatus, 'info' | 'warning' | 'success' | 'danger'> = {
  PENDING: 'info',
  BUILDING: 'warning',
  SUCCESS: 'success',
  FAILED: 'danger',
}
const PREVIEW_LABELS: Record<PreviewState['status'], string> = {
  idle: '未生成',
  building: '生成中',
  ready: '已就绪',
  failed: '生成失败',
}
const PREVIEW_TAG: Record<PreviewState['status'], 'info' | 'warning' | 'success' | 'danger'> = {
  idle: 'info',
  building: 'warning',
  ready: 'success',
  failed: 'danger',
}

const canEdit = useCanEdit()

const pending = ref<PendingChanges | null>(null)
const preview = ref<PreviewState | null>(null)
const releases = ref<Release[]>([])
const total = ref(0)
const liveVersion = ref<number | null>(null)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const acting = ref(false)

const isActive = (r: Release) => r.status === 'PENDING' || r.status === 'BUILDING'
const activeRelease = computed(() => releases.value.find(isActive) ?? null)
const previewBuilding = computed(() => preview.value?.status === 'building')
/** Ids of releases started from this page, so we can announce when they finish. */
const tracked = reactive(new Set<string>())
let trackingPreview = false

const busy = computed(() => !!activeRelease.value || previewBuilding.value || tracked.size > 0)

const changeCount = computed(() => {
  const m = pending.value?.machines
  return m ? m.added.length + m.removed.length + m.changed.length : 0
})

function durationText(r: Release) {
  if (!r.finishedAt) return '-'
  const ms = new Date(r.finishedAt).getTime() - new Date(r.createdAt).getTime()
  return Number.isFinite(ms) && ms >= 0 ? `${Math.round(ms / 1000)} 秒` : '-'
}

function startedByText(p: PreviewState) {
  if (!p.startedBy) return ''
  return typeof p.startedBy === 'string' ? p.startedBy : p.startedBy.displayName
}

// ---------- loading & polling ----------

async function loadList(silent = false) {
  const data = await releaseApi.list(page.value, pageSize.value, silent)
  releases.value = data.items
  total.value = data.total
  liveVersion.value = data.liveVersion
  announceFinished(data.items)
}

function announceFinished(items: Release[]) {
  for (const r of items) {
    if (!tracked.has(r.id) || isActive(r)) continue
    tracked.delete(r.id)
    refreshNavStatus(true)
    if (r.status === 'SUCCESS') ElMessage.success(`v${r.version} 已发布上线`)
    else ElMessage.error(`v${r.version} 构建失败，请查看日志`)
  }
}

function applyPreview(next: PreviewState) {
  const wasBuilding = preview.value?.status === 'building'
  preview.value = next
  if (trackingPreview && wasBuilding && next.status !== 'building') {
    trackingPreview = false
    if (next.status === 'ready') ElMessage.success('预览已生成')
    else if (next.status === 'failed') ElMessage.error('预览生成失败，请查看日志')
  }
}

async function refreshAll(silent = false) {
  const tasks: Promise<unknown>[] = [
    releaseApi.pending(silent).then((p) => (pending.value = p)),
    loadList(silent),
    releaseApi.preview(silent).then(applyPreview),
  ]
  // A tracked build may sit on page 1 while the user browses older pages.
  if (tracked.size && page.value !== 1) {
    tasks.push(releaseApi.list(1, pageSize.value, true).then((d) => announceFinished(d.items)))
  }
  if (logOpen.value && logRelease.value && isActive(logRelease.value)) {
    tasks.push(loadLog(logRelease.value.id, true))
  }
  await Promise.allSettled(tasks)
}

let pollTimer: ReturnType<typeof setTimeout> | undefined
let disposed = false

function schedulePoll() {
  clearTimeout(pollTimer)
  if (disposed || !busy.value) return
  pollTimer = setTimeout(async () => {
    await refreshAll(true)
    schedulePoll()
  }, POLL_MS)
}

async function reload() {
  loading.value = true
  try {
    await refreshAll()
  } finally {
    loading.value = false
    schedulePoll()
  }
}

async function onPageChange() {
  loading.value = true
  try {
    await loadList()
  } catch {
    // Error toast comes from the http interceptor.
  } finally {
    loading.value = false
  }
}

// On phones a fixed action column would cover the version/status columns, so it scrolls with the table.
const narrowQuery = window.matchMedia('(max-width: 768px)')
const narrow = ref(narrowQuery.matches)
const onNarrowChange = (e: MediaQueryListEvent) => (narrow.value = e.matches)

onMounted(() => {
  narrowQuery.addEventListener('change', onNarrowChange)
  reload()
})
onBeforeUnmount(() => {
  disposed = true
  clearTimeout(pollTimer)
  narrowQuery.removeEventListener('change', onNarrowChange)
})

// ---------- publish ----------

const publishOpen = ref(false)
const publishNote = ref('')
const republish = ref(false)

function openPublish(force: boolean) {
  republish.value = force
  publishNote.value = ''
  publishOpen.value = true
}

async function afterStart(release: Release) {
  tracked.add(release.id)
  page.value = 1
  await refreshAll(true)
  schedulePoll()
}

async function confirmPublish() {
  acting.value = true
  try {
    const release = await releaseApi.publish(publishNote.value.trim() || undefined)
    publishOpen.value = false
    ElMessage.info(`v${release.version} 已开始构建，约需 20–30 秒`)
    await afterStart(release)
  } catch {
    // 409 (build already running) is shown by the http interceptor.
  } finally {
    acting.value = false
  }
}

// ---------- rollback ----------

async function rollback(r: Release) {
  let note: string
  try {
    const result = await ElMessageBox.prompt(
      `将使用 v${r.version} 的内容快照重新构建并上线网站。当前数据库中尚未发布的修改不会丢失，仍会保留在“待发布改动”中。`,
      `回滚到 v${r.version}`,
      {
        confirmButtonText: '确认回滚',
        cancelButtonText: '取消',
        type: 'warning',
        inputPlaceholder: `备注（可选，默认“回滚到 v${r.version}”）`,
        inputValidator: (v: string) => (v ?? '').length <= 200 || '备注不能超过 200 个字符',
      },
    )
    note = (result.value ?? '').trim()
  } catch {
    return
  }
  acting.value = true
  try {
    const release = await releaseApi.rollback(r.id, note || undefined)
    ElMessage.info(`v${release.version}（回滚自 v${r.version}）已开始构建`)
    await afterStart(release)
  } catch {
    // 400 / 409 messages are shown by the http interceptor.
  } finally {
    acting.value = false
  }
}

// ---------- preview ----------

const previewLogOpen = ref(false)

async function buildPreview() {
  acting.value = true
  try {
    applyPreview(await releaseApi.buildPreview())
    trackingPreview = true
    ElMessage.info('预览开始生成，约需 20–30 秒')
    schedulePoll()
  } catch {
    // 409 is shown by the http interceptor.
  } finally {
    acting.value = false
  }
}

async function openPreview() {
  // Open the tab synchronously so popup blockers treat it as user-initiated, then point it at the signed URL.
  const win = window.open('', '_blank')
  try {
    const { url } = await releaseApi.previewLink()
    if (win) {
      win.opener = null
      win.location.href = url
    } else {
      window.open(url, '_blank', 'noopener')
    }
  } catch {
    win?.close()
  }
}

// ---------- log drawer ----------

const logOpen = ref(false)
const logRelease = ref<ReleaseDetail | null>(null)
const logLoading = ref(false)
const logRef = ref<HTMLElement>()

async function loadLog(id: string, silent = false) {
  try {
    const detail = await releaseApi.get(id, silent)
    if (!logOpen.value) return
    logRelease.value = detail
    await nextTick()
    if (logRef.value) logRef.value.scrollTop = logRef.value.scrollHeight
  } catch {
    // Error toast comes from the http interceptor (unless silent).
  }
}

async function openLog(r: Release) {
  logRelease.value = null
  logOpen.value = true
  logLoading.value = true
  await loadLog(r.id)
  logLoading.value = false
}
</script>

<template>
  <div class="releases">
    <el-alert v-if="busy" type="warning" :closable="false" class="block banner">
      <template #title>
        <el-icon class="is-loading"><Loading /></el-icon>
        <span v-if="activeRelease">
          正在构建 v{{ activeRelease.version }}…（{{ RELEASE_STATUS_LABELS[activeRelease.status] }}）
        </span>
        <span v-else-if="previewBuilding">正在生成预览…</span>
        <span v-else>正在构建…</span>
      </template>
    </el-alert>

    <!-- 待发布改动 -->
    <section v-loading="loading && !pending" class="page-card block">
      <div class="card-head">
        <h2 class="section-title">待发布改动</h2>
        <el-tag v-if="pending?.hasLive && pending.liveVersion != null" type="success" effect="dark">
          线上版本 v{{ pending.liveVersion }}
        </el-tag>
        <el-tag v-else-if="pending" type="info">尚未发布过</el-tag>
        <span class="spacer" />
        <el-button :icon="Refresh" :disabled="loading" @click="reload">刷新</el-button>
      </div>

      <template v-if="pending">
        <el-empty v-if="!pending.hasChanges" :image-size="80" description="线上已是最新" />
        <template v-else>
          <div class="flags">
            <el-tag v-if="pending.orderChanged" type="warning">排序变化</el-tag>
            <el-tag v-if="pending.categoriesChanged" type="warning">分类变化</el-tag>
            <el-tag v-if="pending.siteChanged" type="warning">站点设置变化</el-tag>
            <span v-if="changeCount" class="muted">共 {{ changeCount }} 个机型有改动</span>
          </div>

          <div class="change-groups">
            <div v-if="pending.machines.added.length" class="group">
              <h3>新增 <span class="count added">{{ pending.machines.added.length }}</span></h3>
              <ul>
                <li v-for="m in pending.machines.added" :key="m.slug">
                  <b>{{ m.model }}</b> {{ m.nameZh }}
                </li>
              </ul>
            </div>
            <div v-if="pending.machines.removed.length" class="group">
              <h3>下架或删除 <span class="count removed">{{ pending.machines.removed.length }}</span></h3>
              <ul>
                <li v-for="m in pending.machines.removed" :key="m.slug">
                  <b>{{ m.model }}</b> {{ m.nameZh }}
                </li>
              </ul>
            </div>
            <div v-if="pending.machines.changed.length" class="group">
              <h3>修改 <span class="count changed">{{ pending.machines.changed.length }}</span></h3>
              <ul>
                <li v-for="m in pending.machines.changed" :key="m.slug">
                  <b>{{ m.model }}</b> {{ m.nameZh }}
                  <el-tag v-for="f in m.fields" :key="f" size="small" effect="plain" class="field">{{ f }}</el-tag>
                </li>
              </ul>
            </div>
          </div>
        </template>

        <el-divider />

        <div class="actions">
          <div class="preview">
            <span class="label">预览：</span>
            <el-tag v-if="preview" :type="PREVIEW_TAG[preview.status]" size="small">
              {{ PREVIEW_LABELS[preview.status] }}
            </el-tag>
            <span v-if="preview?.status === 'ready' && preview.builtAt" class="muted">
              生成于 {{ formatTime(preview.builtAt) }}
              <template v-if="startedByText(preview)">（{{ startedByText(preview) }}）</template>
            </span>
            <el-button v-if="canEdit" :disabled="busy || acting" @click="buildPreview">生成预览</el-button>
            <el-button v-if="preview?.status === 'ready'" type="success" plain :icon="View" @click="openPreview">
              打开预览
            </el-button>
            <el-button v-if="preview?.status === 'failed' && preview.log" link type="danger" @click="previewLogOpen = true">
              查看日志
            </el-button>
          </div>
          <span class="spacer" />
          <template v-if="canEdit">
            <el-button
              v-if="pending.hasChanges"
              type="primary"
              :icon="Promotion"
              :disabled="busy || acting"
              @click="openPublish(false)"
            >
              发布上线
            </el-button>
            <el-button v-else link type="primary" :disabled="busy || acting" @click="openPublish(true)">
              重新发布当前内容
            </el-button>
          </template>
        </div>
      </template>
    </section>

    <!-- 发布历史 -->
    <section class="page-card block">
      <h2 class="section-title">发布历史</h2>
      <el-table v-loading="loading" :data="releases" row-key="id" border style="width: 100%">
        <el-table-column label="版本" min-width="150">
          <template #default="{ row }">
            <b>v{{ row.version }}</b>
            <el-tag v-if="row.isLive" type="success" size="small" effect="dark" class="ml">线上</el-tag>
            <el-tag v-if="row.rollbackOf != null" type="warning" size="small" effect="plain" class="ml">
              回滚自 v{{ row.rollbackOf }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="STATUS_TAG[row.status as ReleaseStatus]" size="small">
              <el-icon v-if="isActive(row as Release)" class="is-loading"><Loading /></el-icon>
              {{ RELEASE_STATUS_LABELS[row.status as ReleaseStatus] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="备注" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.note || '-' }}</template>
        </el-table-column>
        <el-table-column label="发布人" width="120">
          <template #default="{ row }">{{ row.createdBy?.displayName ?? '-' }}</template>
        </el-table-column>
        <el-table-column label="时间" width="150">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="耗时" width="80" align="center">
          <template #default="{ row }">{{ durationText(row as Release) }}</template>
        </el-table-column>
        <el-table-column label="操作" :width="canEdit ? (narrow ? 110 : 170) : 80" :fixed="narrow ? false : 'right'">
          <template #default="{ row }">
            <el-button link type="primary" @click="openLog(row as Release)">日志</el-button>
            <el-button
              v-if="canEdit && row.status === 'SUCCESS' && !row.isLive"
              link
              type="warning"
              :disabled="busy || acting"
              @click="rollback(row as Release)"
            >
              {{ narrow ? '回滚' : '回滚到此版本' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          background
          @current-change="onPageChange"
          @size-change="() => { page = 1; onPageChange() }"
        />
      </div>
    </section>

    <!-- 发布对话框 -->
    <el-dialog
      v-model="publishOpen"
      :title="republish ? '重新发布当前内容' : '发布上线'"
      width="480px"
      class="qj-dialog"
      append-to-body
      :close-on-click-modal="!acting"
    >
      <p class="dialog-tip">
        <template v-if="republish">当前内容与线上一致，将重新构建并发布一个新版本。</template>
        <template v-else>
          将把当前所有已保存的修改构建为新版本并发布到网站（约需 20–30 秒）。
          <template v-if="changeCount">涉及 {{ changeCount }} 个机型。</template>
        </template>
      </p>
      <el-input
        v-model="publishNote"
        type="textarea"
        :rows="3"
        maxlength="200"
        show-word-limit
        placeholder="发布备注（可选），例如：新增 QJ-200 机型"
      />
      <template #footer>
        <el-button :disabled="acting" @click="publishOpen = false">取消</el-button>
        <el-button type="primary" :loading="acting" @click="confirmPublish">确认发布</el-button>
      </template>
    </el-dialog>

    <!-- 发布日志 -->
    <el-drawer
      v-model="logOpen"
      :title="logRelease ? `v${logRelease.version} 构建日志` : '构建日志'"
      size="min(720px, 100vw)"
      append-to-body
    >
      <div v-loading="logLoading" class="log-wrap">
        <template v-if="logRelease">
          <el-descriptions :column="2" border size="small" class="block">
            <el-descriptions-item label="状态">
              <el-tag :type="STATUS_TAG[logRelease.status]" size="small">
                {{ RELEASE_STATUS_LABELS[logRelease.status] }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="发布人">{{ logRelease.createdBy?.displayName ?? '-' }}</el-descriptions-item>
            <el-descriptions-item label="开始">{{ formatTime(logRelease.createdAt) }}</el-descriptions-item>
            <el-descriptions-item label="耗时">{{ durationText(logRelease) }}</el-descriptions-item>
            <el-descriptions-item label="内容" :span="2">
              {{ logRelease.summary?.machines ?? 0 }} 个机型 · {{ logRelease.summary?.categories ?? 0 }} 个分类 ·
              {{ logRelease.summary?.images ?? 0 }} 张图片
            </el-descriptions-item>
            <el-descriptions-item v-if="logRelease.note" label="备注" :span="2">{{ logRelease.note }}</el-descriptions-item>
          </el-descriptions>
          <pre ref="logRef" class="log">{{ logRelease.log || '（暂无日志）' }}</pre>
        </template>
      </div>
    </el-drawer>

    <!-- 预览日志 -->
    <el-dialog v-model="previewLogOpen" title="预览构建日志" width="720px" class="qj-dialog" append-to-body>
      <pre class="log">{{ preview?.log || '（暂无日志）' }}</pre>
    </el-dialog>
  </div>
</template>

<style scoped>
.block {
  margin-bottom: 16px;
}

.banner :deep(.el-alert__title) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.card-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.section-title {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 600;
}

.card-head .section-title {
  margin: 0;
}

.spacer {
  flex: 1;
}

.flags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.muted {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.change-groups {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}

.group {
  padding: 14px 16px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.group h3 {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
  display: flex;
  align-items: center;
  gap: 8px;
}

.group ul {
  margin: 0;
  padding-left: 18px;
  max-height: 260px;
  overflow-y: auto;
  line-height: 2;
  font-size: 13px;
}

.count {
  display: inline-block;
  min-width: 20px;
  padding: 0 6px;
  border-radius: 10px;
  font-size: 12px;
  line-height: 18px;
  text-align: center;
  color: #fff;
  font-weight: 600;
}

.count.added {
  background: var(--el-color-success);
}

.count.removed {
  background: var(--el-color-danger);
}

.count.changed {
  background: var(--el-color-warning);
}

.field {
  margin-left: 4px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.preview {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.preview .label {
  font-size: 13px;
}

.preview .el-button + .el-button {
  margin-left: 0;
}

.ml {
  margin-left: 6px;
}

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
  overflow-x: auto;
}

.dialog-tip {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.log {
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

@media (max-width: 768px) {
  .pager :deep(.el-pagination__sizes) {
    display: none;
  }
}
</style>
