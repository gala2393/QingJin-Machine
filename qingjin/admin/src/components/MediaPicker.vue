<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, Search } from '@element-plus/icons-vue'
import { mediaApi } from '@/api'
import type { MediaItem, MediaUsage } from '@/types/api'

const props = withDefaults(
  defineProps<{
    excludeIds?: string[]
    /** Initial usage filter; the user can switch to "全部". */
    usage?: MediaUsage
    multiple?: boolean
  }>(),
  { excludeIds: () => [], usage: undefined, multiple: true },
)
const visible = defineModel<boolean>({ required: true })
const emit = defineEmits<{ select: [items: MediaItem[]] }>()

const PAGE_SIZE = 24

const q = ref('')
const usageFilter = ref<MediaUsage | ''>('')
const page = ref(1)
const total = ref(0)
const items = ref<MediaItem[]>([])
const loading = ref(false)
const selected = ref(new Map<string, MediaItem>())

const excluded = computed(() => new Set(props.excludeIds))

let seq = 0
async function load() {
  const current = ++seq
  loading.value = true
  try {
    const data = await mediaApi.list({
      page: page.value,
      pageSize: PAGE_SIZE,
      q: q.value.trim() || undefined,
      usage: usageFilter.value || undefined,
    })
    if (current !== seq) return
    items.value = data.items
    total.value = data.total
  } catch {
    if (current === seq) items.value = []
  } finally {
    if (current === seq) loading.value = false
  }
}

function search() {
  page.value = 1
  load()
}

watch(visible, (open) => {
  if (open) {
    selected.value = new Map()
    q.value = ''
    usageFilter.value = props.usage ?? ''
    page.value = 1
    load()
  }
})

function toggle(item: MediaItem) {
  if (excluded.value.has(item.id)) return
  const next = props.multiple ? new Map(selected.value) : new Map<string, MediaItem>()
  if (selected.value.has(item.id)) next.delete(item.id)
  else next.set(item.id, item)
  selected.value = next
}

function confirm() {
  emit('select', [...selected.value.values()])
  visible.value = false
}
</script>

<template>
  <el-dialog v-model="visible" title="从媒体库选择" width="900px" class="qj-dialog" append-to-body>
    <div class="page-toolbar">
      <el-input
        v-model="q"
        placeholder="按文件名搜索"
        :prefix-icon="Search"
        clearable
        style="max-width: 260px"
        @keyup.enter="search"
        @clear="search"
      />
      <el-select v-model="usageFilter" style="width: 120px" @change="search">
        <el-option label="全部用途" value="" />
        <el-option label="产品图" value="machine" />
        <el-option label="站点图片" value="site" />
      </el-select>
      <el-button @click="search">搜索</el-button>
      <span class="spacer" />
      <span class="count">{{ multiple ? `已选 ${selected.size} 张` : '单选' }}</span>
    </div>

    <div v-loading="loading" class="grid">
      <div
        v-for="item in items"
        :key="item.id"
        class="cell"
        :class="{ active: selected.has(item.id), disabled: excluded.has(item.id) }"
        :title="excluded.has(item.id) ? '已在当前机型中' : item.originalName"
        @click="toggle(item)"
      >
        <img :src="item.url" :alt="item.originalName" loading="lazy" />
        <div class="meta">{{ item.width }}×{{ item.height }}</div>
        <div v-if="selected.has(item.id)" class="check"><el-icon><Check /></el-icon></div>
        <div v-if="excluded.has(item.id)" class="added">已添加</div>
      </div>
      <el-empty v-if="!loading && !items.length" description="暂无图片" class="empty" />
    </div>

    <div class="pager">
      <el-pagination
        v-model:current-page="page"
        :page-size="PAGE_SIZE"
        :total="total"
        layout="total, prev, pager, next"
        size="small"
        @current-change="load"
      />
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :disabled="!selected.size" @click="confirm">确定添加（{{ selected.size }}）</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.count {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
  min-height: 200px;
  max-height: 56vh;
  overflow-y: auto;
}

.empty {
  grid-column: 1 / -1;
}

.cell {
  position: relative;
  aspect-ratio: 1;
  border: 2px solid transparent;
  border-radius: 6px;
  overflow: hidden;
  background: var(--el-fill-color-light);
  cursor: pointer;
}

.cell img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.cell.active {
  border-color: var(--el-color-primary);
}

.cell.disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.meta {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 2px 6px;
  font-size: 11px;
  color: #fff;
  background: rgba(0, 0, 0, 0.45);
}

.check {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: var(--el-color-primary);
}

.added {
  position: absolute;
  top: 4px;
  left: 4px;
  padding: 0 6px;
  font-size: 11px;
  border-radius: 3px;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
}

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}
</style>
