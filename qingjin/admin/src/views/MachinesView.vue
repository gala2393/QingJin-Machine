<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type TableInstance } from 'element-plus'
import { Picture, Plus, Rank, Search } from '@element-plus/icons-vue'
import { VueDraggable } from 'vue-draggable-plus'
import { categoryApi, machineApi } from '@/api'
import { useCanEdit } from '@/composables/useCanEdit'
import { refreshNavStatus } from '@/composables/useNavStatus'
import {
  MACHINE_STATUS_LABELS,
  type Category,
  type MachineBatchAction,
  type MachineListItem,
  type MachineStatus,
} from '@/types/api'
import { formatTime } from '@/utils/format'
import { isDismissed } from '@/utils/errors'

const STATUS_TAG: Record<MachineStatus, 'success' | 'info' | 'warning'> = {
  PUBLISHED: 'success',
  DRAFT: 'warning',
  HIDDEN: 'info',
}
const statusOptions = Object.entries(MACHINE_STATUS_LABELS) as [MachineStatus, string][]
const SORT_PAGE_SIZE = 200

const BATCH_LABELS: Record<MachineBatchAction, string> = {
  publish: '上架',
  hide: '下架',
  draft: '设为草稿',
  feature: '设为推荐',
  unfeature: '取消推荐',
  delete: '删除',
}
const batchActions = Object.keys(BATCH_LABELS) as MachineBatchAction[]

const router = useRouter()
const route = useRoute()
const canEdit = useCanEdit()

const filters = reactive<{ q: string; categoryId?: string; status?: MachineStatus; featured?: boolean }>({
  q: '',
  categoryId: undefined,
  status: undefined,
  featured: undefined,
})
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const items = ref<MachineListItem[]>([])
const categories = ref<Category[]>([])
const loading = ref(false)
const busy = ref(false)
const selection = ref<MachineListItem[]>([])
const tableRef = ref<TableInstance>()

const sortMode = ref(false)
const sortList = ref<MachineListItem[]>([])
const sortDirty = ref(false)
const sortTruncated = ref(false)

const selectedCategory = computed(() => categories.value.find((c) => c.id === filters.categoryId))

let requestSeq = 0

async function load() {
  const seq = ++requestSeq
  loading.value = true
  try {
    const data = await machineApi.list({
      page: page.value,
      pageSize: pageSize.value,
      q: filters.q.trim() || undefined,
      categoryId: filters.categoryId,
      status: filters.status,
      featured: filters.featured,
      order: 'pending',
    })
    // Ignore stale responses when filters change faster than the API answers.
    if (seq !== requestSeq) return
    items.value = data.items
    total.value = data.total
  } catch {
    if (seq === requestSeq) {
      items.value = []
      total.value = 0
    }
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

function search() {
  page.value = 1
  load()
}

function reset() {
  filters.q = ''
  filters.categoryId = undefined
  filters.status = undefined
  filters.featured = undefined
  search()
}

function onSizeChange() {
  page.value = 1
  load()
}

async function runBatch(ids: string[], action: MachineBatchAction) {
  if (!ids.length) return
  if (action === 'delete') {
    try {
      await ElMessageBox.confirm(`确定删除选中的 ${ids.length} 个机型吗？此操作不可恢复（图片仍保留在媒体库中）。`, '删除确认', {
        type: 'warning',
        confirmButtonText: '删除',
        confirmButtonClass: 'el-button--danger',
      })
    } catch (e) {
      if (isDismissed(e)) return
      throw e
    }
  }
  busy.value = true
  try {
    const { count } = await machineApi.batch(ids, action)
    ElMessage.success(`已${BATCH_LABELS[action]} ${count} 个机型`)
    tableRef.value?.clearSelection()
    refreshNavStatus(true)
    await load()
  } catch {
    // Error toast comes from the http interceptor.
  } finally {
    busy.value = false
  }
}

function toggleStatus(row: MachineListItem) {
  runBatch([row.id], row.status === 'PUBLISHED' ? 'hide' : 'publish')
}

async function removeOne(row: MachineListItem) {
  try {
    await ElMessageBox.confirm(`确定删除机型「${row.model} ${row.nameZh}」吗？图片仍保留在媒体库中。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      confirmButtonClass: 'el-button--danger',
    })
  } catch {
    return
  }
  try {
    await machineApi.remove(row.id)
    ElMessage.success('已删除')
    if (items.value.length === 1 && page.value > 1) page.value--
    await load()
  } catch {
    // Error toast comes from the http interceptor.
  }
}

async function duplicate(row: MachineListItem) {
  busy.value = true
  try {
    const copy = await machineApi.duplicate(row.id)
    ElMessage.success(`已复制为草稿：${copy.slug}`)
    router.push(`/machines/${copy.id}`)
  } catch {
    // Error toast comes from the http interceptor.
  } finally {
    busy.value = false
  }
}

async function enterSortMode() {
  if (!filters.categoryId) return
  loading.value = true
  try {
    const data = await machineApi.list({ page: 1, pageSize: SORT_PAGE_SIZE, categoryId: filters.categoryId })
    sortList.value = data.items
    sortTruncated.value = data.total > data.items.length
    sortDirty.value = false
    sortMode.value = true
  } catch {
    // Error toast comes from the http interceptor.
  } finally {
    loading.value = false
  }
}

async function exitSortMode() {
  if (sortDirty.value) {
    try {
      await ElMessageBox.confirm('排序尚未保存，确定放弃修改吗？', '提示', { type: 'warning' })
    } catch {
      return
    }
  }
  sortMode.value = false
  sortList.value = []
}

async function saveSort() {
  if (!filters.categoryId) return
  busy.value = true
  try {
    await machineApi.reorder(
      filters.categoryId,
      sortList.value.map((m) => m.id),
    )
    ElMessage.success('排序已保存')
    sortMode.value = false
    sortList.value = []
    await load()
  } catch {
    // Error toast comes from the http interceptor.
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  // Deep links such as /machines?q=QJ-200 (used by the dashboard).
  if (typeof route.query.q === 'string') filters.q = route.query.q
  load()
  categoryApi
    .list()
    .then((list) => (categories.value = list))
    .catch(() => undefined)
})
</script>

<template>
  <div class="page-card">
    <!-- Sort mode -->
    <template v-if="sortMode">
      <div class="page-toolbar">
        <span class="sort-title">
          排序模式：{{ selectedCategory?.nameZh }}（拖动行调整顺序，前台按此顺序展示）
        </span>
        <span class="spacer" />
        <el-button :disabled="busy" @click="exitSortMode">退出</el-button>
        <el-button type="primary" :loading="busy" :disabled="!sortDirty || sortTruncated" @click="saveSort">
          保存排序
        </el-button>
      </div>
      <el-alert
        v-if="sortTruncated"
        type="warning"
        :closable="false"
        show-icon
        :title="`该分类机型超过 ${SORT_PAGE_SIZE} 个，无法在此一次性排序。`"
        class="sort-alert"
      />
      <VueDraggable
        v-model="sortList"
        target=".el-table__body tbody"
        handle=".drag-handle"
        :animation="150"
        @update="sortDirty = true"
      >
        <el-table :data="sortList" row-key="id" border style="width: 100%">
          <el-table-column width="56" align="center">
            <template #default>
              <el-icon class="drag-handle" :size="18"><Rank /></el-icon>
            </template>
          </el-table-column>
          <el-table-column type="index" label="#" width="56" align="center" />
          <el-table-column label="封面" width="80" align="center">
            <template #default="{ row }">
              <img v-if="row.coverUrl" :src="row.coverUrl" alt="" class="cover small" />
              <div v-else class="cover small cover-empty"><el-icon><Picture /></el-icon></div>
            </template>
          </el-table-column>
          <el-table-column prop="model" label="型号" min-width="120" />
          <el-table-column prop="nameZh" label="名称" min-width="200" />
          <el-table-column label="状态" width="96" align="center">
            <template #default="{ row }">
              <el-tag :type="STATUS_TAG[row.status as MachineStatus]" size="small">
                {{ MACHINE_STATUS_LABELS[row.status as MachineStatus] }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </VueDraggable>
    </template>

    <!-- Normal list -->
    <template v-else>
      <div class="page-toolbar">
        <el-input
          v-model="filters.q"
          placeholder="搜索型号 / 名称"
          :prefix-icon="Search"
          clearable
          class="filter-q"
          @keyup.enter="search"
          @clear="search"
        />
        <el-select v-model="filters.categoryId" placeholder="全部分类" clearable class="filter-select" @change="search">
          <el-option v-for="c in categories" :key="c.id" :label="c.nameZh" :value="c.id" />
        </el-select>
        <el-select v-model="filters.status" placeholder="全部状态" clearable class="filter-select" @change="search">
          <el-option v-for="[value, label] in statusOptions" :key="value" :label="label" :value="value" />
        </el-select>
        <el-select v-model="filters.featured" placeholder="是否推荐" clearable class="filter-select" @change="search">
          <el-option label="首页推荐" :value="true" />
          <el-option label="非推荐" :value="false" />
        </el-select>
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
        <span class="spacer" />
        <el-tooltip v-if="canEdit" :disabled="!!filters.categoryId" content="请先选择一个分类" placement="top">
          <span>
            <el-button :icon="Rank" :disabled="!filters.categoryId" @click="enterSortMode">
              排序模式
            </el-button>
          </span>
        </el-tooltip>
        <el-button v-if="canEdit" type="primary" :icon="Plus" @click="router.push('/machines/new')">新增机型</el-button>
      </div>

      <div v-if="canEdit && selection.length" class="batch-bar">
        <span>已选 {{ selection.length }} 项：</span>
        <el-button
          v-for="action in batchActions"
          :key="action"
          size="small"
          :type="action === 'delete' ? 'danger' : 'default'"
          :disabled="busy"
          @click="runBatch(selection.map((m) => m.id), action)"
        >
          {{ BATCH_LABELS[action] }}
        </el-button>
      </div>

      <el-alert v-if="canEdit" type="info" :closable="false" show-icon class="pending-tip">
        未上架（草稿 / 已下架）的机型排在最前面。点击「上架」后，还需要到「发布中心」点击发布，官网才会显示。
        <RouterLink to="/guide" class="tip-link">查看使用教程</RouterLink>
      </el-alert>

      <el-table
        ref="tableRef"
        v-loading="loading"
        :data="items"
        :row-class-name="({ row }: { row: MachineListItem }) => (row.status === 'PUBLISHED' ? '' : 'row-pending')"
        border
        row-key="id"
        style="width: 100%"
        @selection-change="(rows: MachineListItem[]) => (selection = rows)"
      >
        <el-table-column v-if="canEdit" type="selection" width="44" align="center" />
        <el-table-column label="封面" width="96" align="center">
          <template #default="{ row }">
            <el-image
              v-if="row.coverUrl"
              :src="row.coverUrl"
              :preview-src-list="[row.coverUrl]"
              preview-teleported
              fit="cover"
              class="cover"
            />
            <div v-else class="cover cover-empty">
              <el-icon><Picture /></el-icon>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="model" label="型号" min-width="120">
          <template #default="{ row }">
            <RouterLink :to="`/machines/${row.id}`" class="model-link">{{ row.model }}</RouterLink>
          </template>
        </el-table-column>
        <el-table-column label="名称" min-width="200">
          <template #default="{ row }">
            <div>
              {{ row.nameZh }}
              <el-tag v-if="row.featured" size="small" type="danger" effect="plain">推荐</el-tag>
            </div>
            <div v-if="row.nameEn" class="sub">{{ row.nameEn }}</div>
            <div v-else class="missing-en">缺少英文名</div>
          </template>
        </el-table-column>
        <el-table-column label="分类" min-width="120">
          <template #default="{ row }">{{ row.category?.nameZh ?? '-' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="96" align="center">
          <template #default="{ row }">
            <el-tag :type="STATUS_TAG[row.status as MachineStatus]" size="small">
              {{ MACHINE_STATUS_LABELS[row.status as MachineStatus] ?? row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="paramCount" label="参数数" width="80" align="center" />
        <el-table-column label="更新时间" width="150">
          <template #default="{ row }">{{ formatTime(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" :width="canEdit ? 230 : 80" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="router.push(`/machines/${row.id}`)">
              {{ canEdit ? '编辑' : '查看' }}
            </el-button>
            <template v-if="canEdit">
              <el-button link type="primary" :disabled="busy" @click="duplicate(row as MachineListItem)">复制</el-button>
              <el-button v-if="row.status === 'PUBLISHED'" link type="warning" :disabled="busy" @click="toggleStatus(row as MachineListItem)">
                下架
              </el-button>
              <el-button v-else type="success" size="small" :disabled="busy" @click="toggleStatus(row as MachineListItem)">
                上架
              </el-button>
              <el-button link type="danger" :disabled="busy" @click="removeOne(row as MachineListItem)">删除</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100, 200]"
          layout="total, sizes, prev, pager, next, jumper"
          background
          @current-change="load"
          @size-change="onSizeChange"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.filter-q {
  width: 220px;
}

.filter-select {
  width: 140px;
}

.batch-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  margin-bottom: 14px;
  border-radius: 8px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  font-size: 13px;
  color: #1e40af;
  font-weight: 500;
}

.batch-bar .el-button + .el-button {
  margin-left: 0;
}

.sort-title {
  font-weight: 600;
  color: #0f172a;
}

.sort-alert {
  margin-bottom: 14px;
  border-radius: 8px;
}

.pending-tip {
  margin-bottom: 14px;
  border-radius: 8px;
}

.tip-link {
  margin-left: 8px;
  color: var(--el-color-primary);
  font-weight: 500;
}

:deep(.row-pending) > td.el-table__cell {
  background: #fffbeb;
}

.cover {
  width: 58px;
  height: 44px;
  border-radius: 6px;
  display: block;
  margin: 0 auto;
  object-fit: contain;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.cover:hover {
  transform: scale(1.1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.cover.small {
  width: 48px;
  height: 36px;
}

.cover-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-placeholder);
}

.model-link {
  color: var(--el-color-primary);
  font-weight: 600;
  text-decoration: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13.5px;
  transition: color 0.15s ease;
}

.model-link:hover {
  color: var(--el-color-primary-dark-2);
  text-decoration: underline;
}

.sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
  overflow-x: auto;
}

@media (max-width: 768px) {
  .filter-q,
  .filter-select {
    width: 100%;
  }

  .pager :deep(.el-pagination__sizes),
  .pager :deep(.el-pagination__jump) {
    display: none;
  }
}
</style>
