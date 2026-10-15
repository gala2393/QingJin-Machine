<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Plus, Rank } from '@element-plus/icons-vue'
import { VueDraggable } from 'vue-draggable-plus'
import TemplateDrawer from '@/components/TemplateDrawer.vue'
import { categoryApi } from '@/api'
import { useCanEdit } from '@/composables/useCanEdit'
import type { Category } from '@/types/api'
import { SLUG_RE, slugify } from '@/utils/format'

const canEdit = useCanEdit()

const loading = ref(false)
const categories = ref<Category[]>([])
const orderDirty = ref(false)
const savingOrder = ref(false)

async function load() {
  loading.value = true
  try {
    categories.value = await categoryApi.list()
    orderDirty.value = false
  } catch {
    categories.value = []
  } finally {
    loading.value = false
  }
}

async function saveOrder() {
  savingOrder.value = true
  try {
    await categoryApi.reorder(categories.value.map((c) => c.id))
    ElMessage.success('排序已保存')
    await load()
  } catch {
    // Error toast comes from the http interceptor.
  } finally {
    savingOrder.value = false
  }
}

// ---------- create / edit dialog ----------

const dialogOpen = ref(false)
const editing = ref<Category | null>(null)
const saving = ref(false)
const formRef = ref<FormInstance>()
const form = reactive({ slug: '', nameZh: '', nameEn: '', icon: '' })
const slugTouched = ref(false)

watch(
  () => form.nameEn,
  (name) => {
    if (dialogOpen.value && !editing.value && !slugTouched.value) form.slug = slugify(name)
  },
)

const rules: FormRules<typeof form> = {
  slug: [
    { required: true, message: '请填写网址名称（填写英文名称后会自动生成）', trigger: 'blur' },
    { max: 64, message: '不能超过 64 个字符', trigger: 'blur' },
    { pattern: SLUG_RE, message: '只能用小写英文字母、数字和短横线 -，例如 filling-machines', trigger: 'blur' },
  ],
  nameZh: [{ required: true, message: '请输入中文名称', trigger: 'blur' }],
  nameEn: [{ required: true, message: '请输入英文名称', trigger: 'blur' }],
}

function openDialog(category: Category | null) {
  editing.value = category
  Object.assign(form, {
    slug: category?.slug ?? '',
    nameZh: category?.nameZh ?? '',
    nameEn: category?.nameEn ?? '',
    icon: category?.icon ?? '',
  })
  slugTouched.value = !!category
  dialogOpen.value = true
  formRef.value?.clearValidate()
}

async function submit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  const body = {
    slug: form.slug.trim(),
    nameZh: form.nameZh.trim(),
    nameEn: form.nameEn.trim(),
    icon: form.icon.trim(),
  }
  try {
    if (editing.value) {
      await categoryApi.update(editing.value.id, body)
    } else {
      await categoryApi.create({ ...body, icon: body.icon || undefined })
    }
    ElMessage.success('已保存')
    dialogOpen.value = false
    await load()
  } catch {
    // 400 / 409 messages are shown by the http interceptor.
  } finally {
    saving.value = false
  }
}

async function remove(category: Category) {
  try {
    await ElMessageBox.confirm(`确定删除分类「${category.nameZh}」吗？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      confirmButtonClass: 'el-button--danger',
    })
  } catch {
    return
  }
  try {
    await categoryApi.remove(category.id)
    ElMessage.success('已删除')
    await load()
  } catch {
    // The 409 message (category still has machines) is shown by the http interceptor.
  }
}

// ---------- templates ----------

const drawerOpen = ref(false)
const drawerCategory = ref<Category | null>(null)

function openTemplates(category: Category) {
  drawerCategory.value = category
  drawerOpen.value = true
}

const isUrl = (v: string | null) => !!v && /^(https?:\/\/|\/)/.test(v)

onMounted(load)
</script>

<template>
  <div class="page-card">
    <div class="page-toolbar">
      <span v-if="orderDirty" class="dirty">排序已修改，尚未保存</span>
      <span class="spacer" />
      <template v-if="canEdit && orderDirty">
        <el-button :disabled="savingOrder" @click="load">撤销排序</el-button>
        <el-button type="primary" :loading="savingOrder" @click="saveOrder">保存排序</el-button>
      </template>
      <el-button v-else @click="load">刷新</el-button>
      <el-button v-if="canEdit" type="primary" :icon="Plus" @click="openDialog(null)">新增分类</el-button>
    </div>

    <VueDraggable
      v-model="categories"
      target=".el-table__body tbody"
      handle=".drag-handle"
      :animation="150"
      :disabled="!canEdit"
      @update="orderDirty = true"
    >
      <el-table v-loading="loading" :data="categories" row-key="id" border style="width: 100%">
        <el-table-column v-if="canEdit" width="52" align="center">
          <template #default>
            <el-icon class="drag-handle" :size="18"><Rank /></el-icon>
          </template>
        </el-table-column>
        <el-table-column type="index" label="#" width="56" align="center" />
        <el-table-column label="图标" width="72" align="center">
          <template #default="{ row }">
            <img v-if="isUrl(row.icon)" :src="row.icon" alt="" class="icon" />
            <span v-else-if="row.icon" class="icon-text">{{ row.icon }}</span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="nameZh" label="中文名称" min-width="140" />
        <el-table-column prop="nameEn" label="英文名称" min-width="160" />
        <el-table-column prop="slug" label="网址名称" min-width="140" />
        <el-table-column prop="machineCount" label="机型数" width="80" align="center" />
        <el-table-column label="操作" :width="canEdit ? 200 : 100" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openTemplates(row as Category)">参数模板</el-button>
            <template v-if="canEdit">
              <el-button link type="primary" @click="openDialog(row as Category)">编辑</el-button>
              <el-button link type="danger" @click="remove(row as Category)">删除</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
    </VueDraggable>
    <p v-if="canEdit" class="tip">拖动左侧图标调整分类顺序，前台导航按此顺序展示。</p>

    <el-dialog
      v-model="dialogOpen"
      :title="editing ? '编辑分类' : '新增分类'"
      width="480px"
      class="qj-dialog"
      append-to-body
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px" @submit.prevent="submit">
        <el-form-item label="中文名称" prop="nameZh">
          <el-input v-model="form.nameZh" maxlength="100" placeholder="如 智能分装机" />
        </el-form-item>
        <el-form-item label="英文名称" prop="nameEn">
          <el-input v-model="form.nameEn" maxlength="100" placeholder="如 Intelligent Filling Machines" />
        </el-form-item>
        <el-form-item label="网址名称" prop="slug">
          <el-input v-model="form.slug" maxlength="64" placeholder="根据英文名称自动生成" @input="slugTouched = true" />
          <div class="hint">
            用于分类网址，自动生成即可，一般无需修改。<template v-if="editing">已上线的分类改了网址后，旧链接会失效。</template>
          </div>
        </el-form-item>
        <el-form-item label="图标">
          <el-input v-model="form.icon" maxlength="200" placeholder="可不填" />
          <div class="hint">可选。填写图片网址（如 /images/icon.png）或图标名称；不填则不显示图标。</div>
        </el-form-item>
        <button type="submit" hidden />
      </el-form>
      <template #footer>
        <el-button @click="dialogOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>

    <TemplateDrawer v-model="drawerOpen" :category="drawerCategory" :readonly="!canEdit" />
  </div>
</template>

<style scoped>
.dirty {
  font-size: 13px;
  color: var(--el-color-warning);
}

.icon {
  width: 28px;
  height: 28px;
  object-fit: contain;
  border-radius: 4px;
  background: #f8fafc;
}

.icon-text {
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.muted {
  color: var(--el-text-color-placeholder);
}

.hint {
  width: 100%;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}

.tip {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
