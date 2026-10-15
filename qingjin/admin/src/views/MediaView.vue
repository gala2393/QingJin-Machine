<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Upload } from '@element-plus/icons-vue'
import CropUpload from '@/components/CropUpload.vue'
import { mediaApi } from '@/api'
import { useCanEdit } from '@/composables/useCanEdit'
import type { MediaItem, MediaUsage, MediaUsageRef } from '@/types/api'
import { formatBytes, formatTime } from '@/utils/format'

const USAGE_LABELS: Record<MediaUsage, string> = { machine: '产品图', site: '站点图片' }

const canEdit = useCanEdit()

const q = ref('')
const unused = ref(false)
const page = ref(1)
const pageSize = ref(48)
const total = ref(0)
const items = ref<MediaItem[]>([])
const loading = ref(false)

let seq = 0
async function load() {
  const current = ++seq
  loading.value = true
  try {
    const data = await mediaApi.list({
      page: page.value,
      pageSize: pageSize.value,
      q: q.value.trim() || undefined,
      unused: unused.value || undefined,
    })
    if (current !== seq) return
    items.value = data.items
    total.value = data.total
  } catch {
    if (current === seq) {
      items.value = []
      total.value = 0
    }
  } finally {
    if (current === seq) loading.value = false
  }
}

function search() {
  page.value = 1
  load()
}

// ---------- upload ----------

const uploadOpen = ref(false)
const uploadUsage = ref<MediaUsage>('machine')

function startUpload(usage: MediaUsage) {
  uploadUsage.value = usage
  uploadOpen.value = true
}

function onUploaded(media: MediaItem) {
  page.value = 1
  load().then(() => openDetail(media))
}

// ---------- detail ----------

const detailOpen = ref(false)
const current = ref<MediaItem | null>(null)
const usages = ref<MediaUsageRef[]>([])
const usagesLoading = ref(false)
const deleting = ref(false)

const inUse = computed(() => usages.value.length > 0 || (current.value?.usageCount ?? 0) > 0)
const absoluteUrl = computed(() => (current.value ? new URL(current.value.url, window.location.origin).href : ''))

async function openDetail(item: MediaItem) {
  current.value = item
  usages.value = []
  detailOpen.value = true
  usagesLoading.value = true
  try {
    const list = await mediaApi.usages(item.id)
    if (current.value?.id === item.id) usages.value = list
  } catch {
    // Error toast comes from the http interceptor.
  } finally {
    usagesLoading.value = false
  }
}

async function copyUrl() {
  const text = absoluteUrl.value
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // Clipboard API needs a secure context; fall back for plain-http deployments.
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
  ElMessage.success('已复制图片地址')
}

async function remove() {
  if (!current.value) return
  try {
    await ElMessageBox.confirm(`确定删除图片「${current.value.originalName}」吗？此操作不可恢复。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      confirmButtonClass: 'el-button--danger',
    })
  } catch {
    return
  }
  deleting.value = true
  try {
    await mediaApi.remove(current.value.id)
    ElMessage.success('已删除')
    detailOpen.value = false
    if (items.value.length === 1 && page.value > 1) page.value--
    await load()
  } catch {
    // The 409 message (image in use) is shown by the http interceptor.
  } finally {
    deleting.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page-card">
    <div class="page-toolbar">
      <el-input
        v-model="q"
        placeholder="按文件名搜索"
        :prefix-icon="Search"
        clearable
        class="filter-q"
        @keyup.enter="search"
        @clear="search"
      />
      <el-checkbox v-model="unused" @change="search">仅显示未使用</el-checkbox>
      <el-button @click="search">查询</el-button>
      <span class="spacer" />
      <el-dropdown v-if="canEdit" split-button type="primary" @click="startUpload('machine')" @command="startUpload">
        <el-icon class="btn-icon"><Upload /></el-icon>上传图片
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="machine">上传产品图</el-dropdown-item>
            <el-dropdown-item command="site">上传站点图片</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <div v-loading="loading" class="grid">
      <button v-for="item in items" :key="item.id" type="button" class="tile" @click="openDetail(item)">
        <div class="thumb">
          <img :src="item.url" :alt="item.originalName" loading="lazy" />
          <el-tag v-if="!item.usageCount" size="small" type="info" class="unused">未使用</el-tag>
        </div>
        <div class="name" :title="item.originalName">{{ item.originalName }}</div>
        <div class="info">{{ item.width }}×{{ item.height }} · {{ formatBytes(item.size) }}</div>
      </button>
      <el-empty v-if="!loading && !items.length" description="暂无图片" class="empty" />
    </div>

    <div class="pager">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[24, 48, 96, 200]"
        layout="total, sizes, prev, pager, next"
        background
        @current-change="load"
        @size-change="search"
      />
    </div>

    <CropUpload
      v-model="uploadOpen"
      :usage="uploadUsage"
      :default-square="uploadUsage === 'machine'"
      :title="`上传${USAGE_LABELS[uploadUsage]}`" @uploaded="onUploaded" />

    <el-drawer v-model="detailOpen" title="图片详情" size="min(480px, 100vw)" append-to-body>
      <template v-if="current">
        <div class="preview">
          <el-image :src="current.url" :preview-src-list="[current.url]" fit="contain" preview-teleported />
        </div>
        <el-descriptions :column="1" border size="small" class="desc">
          <el-descriptions-item label="文件名">{{ current.originalName }}</el-descriptions-item>
          <el-descriptions-item label="尺寸">{{ current.width }} × {{ current.height }}</el-descriptions-item>
          <el-descriptions-item label="大小">{{ formatBytes(current.size) }}</el-descriptions-item>
          <el-descriptions-item label="用途">{{ USAGE_LABELS[current.usage] ?? current.usage }}</el-descriptions-item>
          <el-descriptions-item label="上传时间">{{ formatTime(current.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="地址">
            <span class="url">{{ current.url }}</span>
            <el-button link type="primary" size="small" @click="copyUrl">复制</el-button>
          </el-descriptions-item>
        </el-descriptions>

        <h3 class="sub-title">使用情况</h3>
        <div v-loading="usagesLoading">
          <ul v-if="usages.length" class="usages">
            <li v-for="(u, i) in usages" :key="u.machineId ?? `site-${i}`">
              <template v-if="u.machineId">
                <RouterLink :to="`/machines/${u.machineId}`" @click="detailOpen = false">{{ u.model }}</RouterLink>
                <span class="muted">{{ u.nameZh }}</span>
              </template>
              <template v-else>
                <RouterLink to="/settings" @click="detailOpen = false">站点设置</RouterLink>
                <span class="muted">{{ u.site }}</span>
              </template>
            </li>
          </ul>
          <p v-else-if="!usagesLoading" class="muted">未被机型或站点设置使用</p>
        </div>
      </template>
      <template #footer>
        <div class="drawer-footer">
          <span v-if="canEdit && inUse" class="muted">图片正在被使用，需先从相关机型或站点设置中移除才能删除</span>
          <el-button @click="detailOpen = false">关闭</el-button>
          <el-button v-if="canEdit" type="danger" :disabled="inUse || usagesLoading" :loading="deleting" @click="remove">
            删除
          </el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.filter-q {
  width: 240px;
}

.btn-icon {
  margin-right: 4px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  min-height: 200px;
}

.empty {
  grid-column: 1 / -1;
}

.tile {
  display: flex;
  flex-direction: column;
  padding: 0;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: #ffffff;
  overflow: hidden;
  cursor: pointer;
  text-align: left;
  font: inherit;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
}

.tile:hover,
.tile:focus-visible {
  border-color: var(--el-color-primary);
  box-shadow: 0 10px 20px -5px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
  outline: none;
}

.thumb {
  position: relative;
  aspect-ratio: 1;
  background: var(--el-fill-color-light);
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.unused {
  position: absolute;
  top: 6px;
  left: 6px;
}

.name {
  padding: 6px 8px 0;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.info {
  padding: 0 8px 6px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
  overflow-x: auto;
}

.preview {
  display: flex;
  justify-content: center;
  height: 280px;
  margin-bottom: 16px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
}

.preview .el-image {
  width: 100%;
  height: 100%;
}

.desc {
  margin-bottom: 16px;
}

.url {
  word-break: break-all;
  margin-right: 4px;
}

.sub-title {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
}

.usages {
  margin: 0;
  padding-left: 18px;
  line-height: 1.9;
}

.usages a {
  color: var(--el-color-primary);
  margin-right: 8px;
  text-decoration: none;
}

.muted {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.drawer-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.drawer-footer .el-button + .el-button {
  margin-left: 0;
}

@media (max-width: 768px) {
  .filter-q {
    width: 100%;
  }

  .grid {
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  }

  .pager :deep(.el-pagination__sizes) {
    display: none;
  }
}
</style>
