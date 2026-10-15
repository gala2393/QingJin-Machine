<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Plus, Rank } from '@element-plus/icons-vue'
import { VueDraggable } from 'vue-draggable-plus'
import { categoryApi } from '@/api'
import type { Category, ParamTemplateInput } from '@/types/api'
import { PARAM_KEY_RE, toParamKey } from '@/utils/format'

interface Row extends ParamTemplateInput {
  uid: number
}

const props = defineProps<{ category: Category | null; readonly?: boolean }>()
const visible = defineModel<boolean>({ required: true })
const emit = defineEmits<{ saved: [] }>()

const rows = ref<Row[]>([])
const loading = ref(false)
const saving = ref(false)
const submitted = ref(false)
let snapshot = ''
let uidSeq = 0

const serialize = () => JSON.stringify(rows.value.map(({ key, labelZh, labelEn }) => ({ key, labelZh, labelEn })))
const dirty = computed(() => serialize() !== snapshot)

watch(visible, async (open) => {
  if (!open || !props.category) return
  rows.value = []
  submitted.value = false
  snapshot = serialize()
  loading.value = true
  try {
    const list = await categoryApi.templates(props.category.id)
    rows.value = list.map((t) => ({ key: t.key, labelZh: t.labelZh, labelEn: t.labelEn, uid: ++uidSeq }))
    snapshot = serialize()
  } catch {
    // Error toast comes from the http interceptor.
  } finally {
    loading.value = false
  }
})

const issues = computed(() => {
  const map = new Map<number, string>()
  if (!submitted.value) return map
  const seen = new Set<string>()
  for (const r of rows.value) {
    const zh = r.labelZh.trim()
    let msg = ''
    if (!zh || !r.labelEn.trim()) msg = '请填写中文和英文参数名'
    else if (seen.has(zh)) msg = '参数名重复'
    seen.add(zh)
    if (msg) map.set(r.uid, msg)
  }
  return map
})

function add() {
  rows.value.push({ key: '', labelZh: '', labelEn: '', uid: ++uidSeq })
}

/** Keys are internal ids shared with machines' parameters; new rows get one from the English name. */
function ensureKeys() {
  const used = new Set(rows.value.map((r) => r.key).filter((k) => PARAM_KEY_RE.test(k)))
  for (const r of rows.value) {
    if (PARAM_KEY_RE.test(r.key)) continue
    const base = toParamKey(r.labelEn) || 'param'
    let key = base
    for (let n = 2; used.has(key); n++) key = `${base.slice(0, 60)}_${n}`
    r.key = key
    used.add(key)
  }
}

async function save() {
  if (!props.category) return
  submitted.value = true
  if (issues.value.size) {
    ElMessage.error(`有 ${issues.value.size} 行没填完整，请看标红的行`)
    return
  }
  ensureKeys()
  saving.value = true
  try {
    const saved = await categoryApi.saveTemplates(
      props.category.id,
      rows.value.map(({ key, labelZh, labelEn }) => ({ key: key.trim(), labelZh: labelZh.trim(), labelEn: labelEn.trim() })),
    )
    rows.value = saved.map((t) => ({ key: t.key, labelZh: t.labelZh, labelEn: t.labelEn, uid: ++uidSeq }))
    snapshot = serialize()
    ElMessage.success('参数模板已保存')
    emit('saved')
    visible.value = false
  } catch {
    // Error toast comes from the http interceptor.
  } finally {
    saving.value = false
  }
}

async function beforeClose(done: () => void) {
  if (!dirty.value || props.readonly) return done()
  try {
    await ElMessageBox.confirm('参数模板尚未保存，确定关闭吗？', '提示', { type: 'warning' })
    done()
  } catch {
    // Keep the drawer open.
  }
}
</script>

<template>
  <el-drawer
    v-model="visible"
    :title="`参数模板 - ${category?.nameZh ?? ''}`"
    size="min(760px, 100vw)"
    append-to-body
    :before-close="beforeClose"
  >
    <div v-loading="loading">
      <p class="tip">
        这里设置该分类机型常用的参数名（只填名称，不填数值）。新建机型选择该分类后，可一键套用，再逐项填写数值。<br />
        例如：称重范围 / Weighing Range、分装速度 / Filling Speed。拖动左侧图标可调整顺序。
      </p>
      <div v-if="!readonly" class="page-toolbar">
        <el-button :icon="Plus" @click="add">添加参数</el-button>
      </div>
      <div class="table-scroll">
        <VueDraggable v-model="rows" target="tbody" handle=".drag-handle" :animation="150" :disabled="readonly">
          <table class="tpl-table">
            <thead>
              <tr>
                <th class="col-handle"></th>
                <th>中文参数名</th>
                <th>英文参数名</th>
                <th v-if="!readonly" class="col-op"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in rows" :key="row.uid" :class="{ invalid: issues.has(row.uid) }">
                <td class="col-handle">
                  <el-icon v-if="!readonly" class="drag-handle" :size="16"><Rank /></el-icon>
                </td>
                <td>
                  <el-input v-model="row.labelZh" size="small" maxlength="100" placeholder="如 称重范围" :disabled="readonly" />
                  <div v-if="issues.get(row.uid)" class="row-error">{{ issues.get(row.uid) }}</div>
                </td>
                <td>
                  <el-input v-model="row.labelEn" size="small" maxlength="100" placeholder="如 Weighing Range" :disabled="readonly" />
                </td>
                <td v-if="!readonly" class="col-op">
                  <el-button link type="danger" :icon="Delete" aria-label="删除" @click="rows.splice(index, 1)" />
                </td>
              </tr>
            </tbody>
          </table>
        </VueDraggable>
        <el-empty v-if="!loading && !rows.length" :image-size="60" description="暂无模板参数" />
      </div>
    </div>
    <template #footer>
      <el-button @click="visible = false">{{ readonly ? '关闭' : '取消' }}</el-button>
      <el-button v-if="!readonly" type="primary" :loading="saving" @click="save">保存模板</el-button>
    </template>
  </el-drawer>
</template>

<style scoped>
.tip {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.table-scroll {
  overflow-x: auto;
}

.tpl-table {
  width: 100%;
  min-width: 520px;
  border-collapse: collapse;
}

.tpl-table th,
.tpl-table td {
  padding: 6px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  text-align: left;
  vertical-align: top;
}

.tpl-table th {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-lighter);
}

.col-handle {
  width: 32px;
  text-align: center;
  padding-top: 10px !important;
}

.col-op {
  width: 44px;
  text-align: center;
}

tr.invalid td {
  background: var(--el-color-danger-light-9);
}

.row-error {
  margin-top: 2px;
  font-size: 12px;
  line-height: 1.3;
  color: var(--el-color-danger);
}
</style>
