<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, genFileId, type UploadFile, type UploadInstance, type UploadRawFile } from 'element-plus'
import { Download, Loading, Refresh, UploadFilled } from '@element-plus/icons-vue'
import { backupsApi, excelApi } from '@/api/admin'
import { useCanEdit } from '@/composables/useCanEdit'
import { useAuthStore } from '@/stores/auth'
import type { Category, MachineStatus } from '@/types/api'
import type { BackupFile, BackupStatus, ImportResult } from '@/types/admin'
import { formatBytes, formatTime } from '@/utils/format'

const router = useRouter()
const auth = useAuthStore()
const canEdit = useCanEdit()
const isSuperAdmin = computed(() => auth.hasRole('SUPER_ADMIN'))

const tab = ref<'excel' | 'backup'>('excel')

// ---------- export ----------

const EXPORT_STATUS: { value: MachineStatus | ''; label: string }[] = [
  { value: '', label: '全部' },
  { value: 'PUBLISHED', label: '已上架' },
  { value: 'DRAFT', label: '草稿' },
  { value: 'HIDDEN', label: '隐藏' },
]

const categories = ref<Category[]>([])
const exportCategory = ref('')
const exportStatus = ref<MachineStatus | ''>('')
const exporting = ref(false)

async function doExport() {
  exporting.value = true
  try {
    await excelApi.exportMachines({
      categoryId: exportCategory.value || undefined,
      status: exportStatus.value || undefined,
    })
  } catch {
    // Error toast is shown by the download helper.
  } finally {
    exporting.value = false
  }
}

// ---------- import ----------

const MAX_SIZE = 10 * 1024 * 1024

const uploadRef = ref<UploadInstance>()
const importFile = ref<File | null>(null)
const checking = ref(false)
const applying = ref(false)
const result = ref<ImportResult | null>(null)
const applied = ref<ImportResult | null>(null)
const expanded = ref<string[]>([])

const canApply = computed(
  () => !!result.value && result.value.errors.length === 0 && result.value.created.length + result.value.updated.length > 0,
)

function onFileChange(file: UploadFile) {
  const raw = file.raw
  if (!raw) return
  if (!/\.xlsx$/i.test(raw.name)) {
    ElMessage.error('请选择 .xlsx 格式的 Excel 文件')
    uploadRef.value?.clearFiles()
    importFile.value = null
    return
  }
  if (raw.size > MAX_SIZE) {
    ElMessage.error('文件不能超过 10 MB')
    uploadRef.value?.clearFiles()
    importFile.value = null
    return
  }
  importFile.value = raw
  result.value = null
  applied.value = null
}

function onExceed(files: File[]) {
  uploadRef.value?.clearFiles()
  const file = files[0] as UploadRawFile | undefined
  if (!file) return
  file.uid = genFileId()
  uploadRef.value?.handleStart(file)
}

function onRemove() {
  importFile.value = null
  result.value = null
}

async function check() {
  if (!importFile.value) {
    ElMessage.warning('请先选择文件')
    return
  }
  checking.value = true
  applied.value = null
  try {
    result.value = await excelApi.importMachines(importFile.value, true)
    expanded.value = []
    if (result.value.errors.length) ElMessage.warning(`发现 ${result.value.errors.length} 个问题，请修正后重新上传`)
    else if (!result.value.created.length && !result.value.updated.length) ElMessage.info('文件内容与当前数据一致，无需导入')
  } catch {
    result.value = null
  } finally {
    checking.value = false
  }
}

async function apply() {
  if (!importFile.value || !canApply.value) return
  applying.value = true
  try {
    const res = await excelApi.importMachines(importFile.value, false)
    if (res.errors.length || !res.applied) {
      // Data changed between the check and the import; show the fresh errors.
      result.value = res
      ElMessage.error('导入失败，文件存在问题，未写入任何数据')
      return
    }
    applied.value = res
    result.value = null
    importFile.value = null
    uploadRef.value?.clearFiles()
    ElMessage.success(`导入成功：新增 ${res.created.length} 个，修改 ${res.updated.length} 个`)
  } catch {
    // Error toast comes from the http interceptor.
  } finally {
    applying.value = false
  }
}

// ---------- backups ----------

const BACKUP_POLL_MS = 5000
const BACKUP_POLL_MAX_MS = 3 * 60 * 1000

const backup = ref<BackupStatus | null>(null)
const backupLoading = ref(false)
const backupRunning = ref(false)
const downloading = ref<string | null>(null)
const logPanel = ref<string[]>([])
let pollTimer: ReturnType<typeof setTimeout> | undefined
let pollStartedAt = 0
let disposed = false

const sortedFiles = computed(() =>
  [...(backup.value?.files ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
)

async function loadBackups(silent = false) {
  if (!silent) backupLoading.value = true
  try {
    backup.value = await backupsApi.status(silent)
  } catch {
    // Error toast comes from the http interceptor (unless silent).
  } finally {
    backupLoading.value = false
  }
}

function stopPoll() {
  clearTimeout(pollTimer)
  pollTimer = undefined
}

function schedulePoll() {
  stopPoll()
  if (disposed || !backup.value?.requestPending) return
  if (Date.now() - pollStartedAt > BACKUP_POLL_MAX_MS) {
    ElMessage.warning('备份仍在等待执行，请稍后刷新查看')
    return
  }
  pollTimer = setTimeout(async () => {
    await loadBackups(true)
    if (backup.value && !backup.value.requestPending) {
      ElMessage.success('备份已执行，请查看文件列表和日志')
      return
    }
    schedulePoll()
  }, BACKUP_POLL_MS)
}

function startPoll() {
  pollStartedAt = Date.now()
  schedulePoll()
}

async function runBackup() {
  backupRunning.value = true
  try {
    await backupsApi.run()
    ElMessage.info('已提交备份请求，备份容器约 30 秒内开始执行')
    await loadBackups(true)
    if (backup.value) backup.value.requestPending = true
    startPoll()
  } catch {
    // 409 (already pending) is shown by the http interceptor; refresh to reflect it.
    await loadBackups(true)
    if (backup.value?.requestPending) startPoll()
  } finally {
    backupRunning.value = false
  }
}

async function downloadBackup(f: BackupFile) {
  downloading.value = f.name
  try {
    await backupsApi.download(f.name)
  } catch {
    // Error toast is shown by the download helper.
  } finally {
    downloading.value = null
  }
}

let backupLoaded = false
watch(tab, (t) => {
  if (t === 'backup' && !backupLoaded) {
    backupLoaded = true
    loadBackups().then(() => {
      if (backup.value?.requestPending) startPoll()
    })
  }
})

const narrowQuery = window.matchMedia('(max-width: 768px)')
const narrow = ref(narrowQuery.matches)
const onNarrowChange = (e: MediaQueryListEvent) => (narrow.value = e.matches)

onMounted(() => {
  narrowQuery.addEventListener('change', onNarrowChange)
  excelApi
    .categories()
    .then((c) => (categories.value = c))
    .catch(() => undefined)
})
onBeforeUnmount(() => {
  disposed = true
  stopPoll()
  narrowQuery.removeEventListener('change', onNarrowChange)
})
</script>

<template>
  <div class="page-card">
    <el-tabs v-model="tab">
      <!-- ================= Excel ================= -->
      <el-tab-pane label="Excel 导出/导入" name="excel">
        <div class="cards">
          <!-- 导出 -->
          <section class="sub-card">
            <h2 class="section-title">导出机型</h2>
            <p class="tip">
              导出为 .xlsx 文件，包含「机型」「参数」「分类」「说明」四个工作表。可在 Excel 中修改后再导入。
            </p>
            <el-form label-position="top" class="export-form" @submit.prevent>
              <el-form-item label="分类">
                <el-select v-model="exportCategory" placeholder="全部分类" clearable style="width: 100%">
                  <el-option label="全部分类" value="" />
                  <el-option v-for="c in categories" :key="c.id" :label="c.nameZh" :value="c.id" />
                </el-select>
              </el-form-item>
              <el-form-item label="状态">
                <el-select v-model="exportStatus" style="width: 100%">
                  <el-option v-for="s in EXPORT_STATUS" :key="s.value" :label="s.label" :value="s.value" />
                </el-select>
              </el-form-item>
            </el-form>
            <el-button type="primary" :icon="Download" :loading="exporting" @click="doExport">导出 Excel</el-button>
          </section>

          <!-- 导入 -->
          <section class="sub-card">
            <h2 class="section-title">导入机型</h2>
            <el-alert type="info" :closable="false" show-icon class="block" title="导入规则">
              <ul class="rules">
                <li>按 slug 匹配：已存在的 slug 会更新，不存在的会新增。</li>
                <li>不会删除任何机型；表中没有的机型保持不变。</li>
                <li>「参数」表中出现的机型会整体替换其参数；未出现的机型参数不变。</li>
                <li>图片不通过 Excel 导入，请在机型编辑页设置；新增的机型没有封面。</li>
                <li>建议先导出一份作为模板。文件中有任何错误时不会写入任何数据。</li>
              </ul>
            </el-alert>

            <el-alert
              v-if="!canEdit"
              type="warning"
              :closable="false"
              show-icon
              title="当前账号为只读角色，无法导入数据。"
            />

            <template v-else>
              <el-upload
                ref="uploadRef"
                drag
                :auto-upload="false"
                :limit="1"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                :on-change="onFileChange"
                :on-exceed="onExceed"
                :on-remove="onRemove"
                class="uploader"
              >
                <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
                <div class="el-upload__text">将 .xlsx 文件拖到此处，或<em>点击选择</em></div>
                <template #tip>
                  <div class="el-upload__tip">仅支持 .xlsx，不超过 10 MB</div>
                </template>
              </el-upload>

              <div class="import-actions">
                <el-button :loading="checking" :disabled="!importFile || applying" @click="check">检查文件</el-button>
                <el-button
                  type="primary"
                  :loading="applying"
                  :disabled="!canApply || checking"
                  @click="apply"
                >
                  确认导入
                </el-button>
              </div>
            </template>

            <!-- 检查结果 -->
            <div v-if="result" class="result">
              <template v-if="result.errors.length">
                <el-alert
                  type="error"
                  :closable="false"
                  show-icon
                  :title="`发现 ${result.errors.length} 个问题，请修正后重新上传（未导入任何数据）`"
                  class="block"
                />
                <el-table :data="result.errors" border size="small" max-height="400" style="width: 100%">
                  <el-table-column prop="sheet" label="工作表" width="90" />
                  <el-table-column prop="row" label="行号" width="70" align="center" />
                  <el-table-column prop="message" label="问题" min-width="200" />
                </el-table>
              </template>
              <template v-else>
                <div class="summary">
                  <div class="stat added"><b>{{ result.created.length }}</b><span>新增</span></div>
                  <div class="stat changed"><b>{{ result.updated.length }}</b><span>修改</span></div>
                  <div class="stat same"><b>{{ result.unchanged }}</b><span>未变化</span></div>
                </div>
                <el-collapse v-if="result.created.length || result.updated.length" v-model="expanded">
                  <el-collapse-item v-if="result.created.length" name="created" :title="`新增 ${result.created.length} 个机型`">
                    <ul class="list">
                      <li v-for="m in result.created" :key="m.slug">
                        <b>{{ m.model }}</b> <span class="muted">{{ m.slug }}</span>
                      </li>
                    </ul>
                  </el-collapse-item>
                  <el-collapse-item v-if="result.updated.length" name="updated" :title="`修改 ${result.updated.length} 个机型`">
                    <ul class="list">
                      <li v-for="m in result.updated" :key="m.slug">
                        <b>{{ m.model }}</b> <span class="muted">{{ m.slug }}</span>
                        <el-tag v-for="f in m.fields" :key="f" size="small" effect="plain" class="field">{{ f }}</el-tag>
                      </li>
                    </ul>
                  </el-collapse-item>
                </el-collapse>
                <p class="tip">另有 {{ result.unchanged }} 个机型未变化。确认无误后点击“确认导入”。</p>
              </template>
            </div>

            <!-- 导入完成 -->
            <el-result
              v-if="applied"
              icon="success"
              title="导入成功"
              :sub-title="`新增 ${applied.created.length} 个，修改 ${applied.updated.length} 个，未变化 ${applied.unchanged} 个`"
              class="done"
            >
              <template #extra>
                <p class="tip">导入后需在发布中心发布才会上线。</p>
                <el-button type="primary" @click="router.push('/releases')">前往发布中心</el-button>
              </template>
            </el-result>
          </section>
        </div>
      </el-tab-pane>

      <!-- ================= 备份 ================= -->
      <el-tab-pane v-if="isSuperAdmin" label="数据备份" name="backup">
        <div v-loading="backupLoading && !backup" class="backup">
          <template v-if="backup">
            <el-alert
              v-if="!backup.enabled"
              type="info"
              :closable="false"
              show-icon
              title="当前环境未启用备份"
            >
              <p class="alert-text">
                备份功能在生产环境的 Docker 部署中运行：备份容器每天自动备份数据库和图片，保留最近
                {{ backup.keep || 'N' }} 份。当前服务器未配置备份目录，因此这里没有备份文件。
              </p>
            </el-alert>

            <template v-else>
              <div class="page-toolbar">
                <div class="backup-info">
                  <span>计划：<b>{{ backup.schedule || '-' }}</b></span>
                  <span>保留最近 <b>{{ backup.keep }}</b> 份</span>
                  <el-tag v-if="backup.requestPending" type="warning" size="small">
                    <el-icon class="is-loading"><Loading /></el-icon>
                    等待执行备份…
                  </el-tag>
                </div>
                <span class="spacer" />
                <el-button :icon="Refresh" :disabled="backupLoading" @click="loadBackups()">刷新</el-button>
                <el-button
                  type="primary"
                  :loading="backupRunning"
                  :disabled="backup.requestPending"
                  @click="runBackup"
                >
                  立即备份
                </el-button>
              </div>

              <el-table :data="sortedFiles" border row-key="name" style="width: 100%" empty-text="暂无备份文件">
                <el-table-column prop="name" label="文件名" min-width="240" show-overflow-tooltip>
                  <template #default="{ row }"><span class="mono">{{ row.name }}</span></template>
                </el-table-column>
                <el-table-column label="类型" width="90" align="center">
                  <template #default="{ row }">
                    <el-tag :type="row.type === 'database' ? 'primary' : 'success'" size="small">
                      {{ row.type === 'database' ? '数据库' : row.type === 'uploads' ? '图片' : row.type }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="大小" width="110" align="right">
                  <template #default="{ row }">{{ formatBytes(row.size) }}</template>
                </el-table-column>
                <el-table-column label="时间" width="150">
                  <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
                </el-table-column>
                <el-table-column label="操作" width="80" align="center" :fixed="narrow ? false : 'right'">
                  <template #default="{ row }">
                    <el-button
                      link
                      type="primary"
                      :loading="downloading === row.name"
                      :disabled="!!downloading && downloading !== row.name"
                      @click="downloadBackup(row as BackupFile)"
                    >
                      下载
                    </el-button>
                  </template>
                </el-table-column>
              </el-table>

              <el-collapse v-model="logPanel" class="log-collapse">
                <el-collapse-item name="log" title="备份日志（最近 50 行）">
                  <pre class="log">{{ backup.log || '（暂无日志）' }}</pre>
                </el-collapse-item>
              </el-collapse>
            </template>
          </template>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.cards {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr);
  gap: 16px;
  align-items: start;
}

.sub-card {
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}

.section-title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 600;
}

.tip {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.block {
  margin-bottom: 12px;
}

.rules {
  margin: 4px 0 0;
  padding-left: 18px;
  line-height: 1.8;
}

.uploader {
  margin-top: 12px;
}

.import-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.import-actions .el-button + .el-button {
  margin-left: 0;
}

.result {
  margin-top: 16px;
}

.summary {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
}

.stat {
  flex: 1 1 80px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 10px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  transition: all 0.2s ease;
}

.stat b {
  font-size: 24px;
  line-height: 1.2;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.stat.added b {
  color: var(--el-color-success);
}

.stat.changed b {
  color: var(--el-color-warning);
}

.stat.same b {
  color: var(--el-text-color-regular);
}

.list {
  margin: 0;
  padding-left: 18px;
  max-height: 300px;
  overflow-y: auto;
  line-height: 2;
  font-size: 13px;
}

.field {
  margin-left: 4px;
}

.muted {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.result .tip {
  margin-top: 12px;
}

.done {
  padding: 16px 0 0;
}

.done .tip {
  margin-bottom: 8px;
}

.alert-text {
  margin: 4px 0 0;
  line-height: 1.6;
}

.backup {
  min-height: 120px;
}

.backup-info {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  font-size: 13px;
}

.backup-info :deep(.el-tag__content) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}

.log-collapse {
  margin-top: 16px;
}

.log {
  margin: 0;
  max-height: 50vh;
  overflow: auto;
  padding: 16px;
  border-radius: 8px;
  background: #0f172a;
  border: 1px solid #1e293b;
  color: #e2e8f0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}

@media (max-width: 960px) {
  .cards {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 768px) {
  .sub-card {
    padding: 12px;
  }
}
</style>
