<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type FormInstance, type FormItemRule, type FormRules } from 'element-plus'
import { Delete, Picture, Plus, Rank, Star, Upload } from '@element-plus/icons-vue'
import { VueDraggable } from 'vue-draggable-plus'
import CropUpload from '@/components/CropUpload.vue'
import MediaPicker from '@/components/MediaPicker.vue'
import { categoryApi, machineApi } from '@/api'
import { useCanEdit } from '@/composables/useCanEdit'
import {
  MACHINE_STATUS_LABELS,
  type Category,
  type MachineDetail,
  type MachineImage,
  type MachineInput,
  type MachineParam,
  type MachineStatus,
  type MediaItem,
  type ParamTemplate,
} from '@/types/api'
import { PARAM_KEY_RE, SLUG_RE, formatTime, slugify, toParamKey } from '@/utils/format'
import { errorStatus } from '@/utils/errors'

interface ParamRow extends MachineParam {
  uid: number
}

const route = useRoute()
const router = useRouter()
const canEdit = useCanEdit()

const statusOptions = Object.entries(MACHINE_STATUS_LABELS) as [MachineStatus, string][]

const machineId = computed(() => (route.name === 'machine-edit' ? String(route.params.id) : null))
const isNew = computed(() => !machineId.value)

const formRef = ref<FormInstance>()
const loading = ref(false)
const saving = ref(false)
const notFound = ref(false)
const submitted = ref(false)
const categories = ref<Category[]>([])
const detail = ref<MachineDetail | null>(null)

const form = reactive({
  model: '',
  slug: '',
  categoryId: '',
  nameZh: '',
  nameEn: '',
  summaryZh: '',
  summaryEn: '',
  status: 'DRAFT' as MachineStatus,
  featured: false,
  seoTitleZh: '',
  seoTitleEn: '',
  seoDescZh: '',
  seoDescEn: '',
  notes: '',
})
const params = ref<ParamRow[]>([])
const images = ref<MachineImage[]>([])
const extraPanels = ref<string[]>([])

const pickerOpen = ref(false)
const uploadOpen = ref(false)

let uidSeq = 0
const toRow = (p: MachineParam): ParamRow => ({ ...p, uid: ++uidSeq })

// ---------- slug ----------

const slugTouched = ref(false)
type SlugState = 'idle' | 'checking' | 'ok' | 'taken' | 'error'
const slugState = ref<SlugState>('idle')
let slugTimer: ReturnType<typeof setTimeout> | undefined
let slugSeq = 0

/** Models written only in Chinese produce no ASCII slug, so give them a unique fallback. */
const slugFromModel = (model: string) => slugify(model) || (model.trim() ? `machine-${Date.now().toString(36)}` : '')

/** "kl-y100" -> "kl-y100-2", "kl-y100-2" -> "kl-y100-3". */
function nextSlug(slug: string) {
  const m = /^(.*)-(\d+)$/.exec(slug)
  return m ? `${m[1]}-${Number(m[2]) + 1}` : `${slug}-2`.slice(0, 64)
}

watch(
  () => form.model,
  (model) => {
    if (!slugTouched.value) form.slug = slugFromModel(model)
  },
)

watch(
  () => form.slug,
  (slug) => {
    clearTimeout(slugTimer)
    if (!slug || !SLUG_RE.test(slug) || slug.length > 64) {
      slugState.value = 'idle'
      return
    }
    if (detail.value && slug === detail.value.slug) {
      slugState.value = 'ok'
      return
    }
    slugState.value = 'checking'
    const seq = ++slugSeq
    slugTimer = setTimeout(async () => {
      try {
        const available = await machineApi.slugAvailable(slug, machineId.value ?? undefined)
        if (seq !== slugSeq) return
        // An auto-generated address that is already used (two machines share a model) just gets a suffix.
        if (!available && !slugTouched.value) {
          form.slug = nextSlug(slug)
          return
        }
        slugState.value = available ? 'ok' : 'taken'
      } catch {
        if (seq === slugSeq) slugState.value = 'error'
      }
      if (seq === slugSeq && slugState.value === 'taken') formRef.value?.validateField('slug').catch(() => undefined)
    }, 400)
  },
)

function onSlugInput() {
  slugTouched.value = true
}

function openUrlPanel() {
  if (!extraPanels.value.includes('url')) extraPanels.value.push('url')
}

function resetSlugToModel() {
  slugTouched.value = false
  form.slug = slugFromModel(form.model)
}

// ---------- validation ----------

const slugValidator: FormItemRule['validator'] = (_rule, value: string, callback) => {
  if (!value) return callback(new Error('请填写网址名称（或先填写型号自动生成）'))
  if (value.length > 64) return callback(new Error('网址名称不能超过 64 个字符'))
  if (!SLUG_RE.test(value)) return callback(new Error('只能用小写英文字母、数字和短横线 -，例如 kl-y100'))
  if (slugState.value === 'taken') return callback(new Error('这个网址已被其他机型使用，请换一个'))
  callback()
}

const rules: FormRules<typeof form> = {
  model: [
    { required: true, message: '请输入型号', trigger: 'blur' },
    { max: 64, message: '型号不能超过 64 个字符', trigger: 'blur' },
  ],
  slug: [{ validator: slugValidator, trigger: 'blur' }],
  categoryId: [{ required: true, message: '请选择分类', trigger: 'change' }],
  nameZh: [
    { required: true, message: '请输入中文名', trigger: 'blur' },
    { max: 200, message: '不能超过 200 个字符', trigger: 'blur' },
  ],
  nameEn: [
    { required: true, message: '请输入英文名', trigger: 'blur' },
    { max: 200, message: '不能超过 200 个字符', trigger: 'blur' },
  ],
}

const paramIssues = computed(() => {
  const issues = new Map<number, string>()
  if (!submitted.value) return issues
  for (const p of params.value) {
    const missing = [
      !p.labelZh.trim() && '中文参数名',
      !p.labelEn.trim() && '英文参数名',
      !p.valueZh.trim() && '中文值',
    ].filter(Boolean)
    if (missing.length) issues.set(p.uid, `请填写${missing.join('、')}`)
  }
  return issues
})

const missingValueEn = computed(() => params.value.filter((p) => !p.valueEn.trim()).length)

// ---------- params ----------

function addParam() {
  params.value.push(toRow({ key: '', labelZh: '', labelEn: '', valueZh: '', valueEn: '' }))
}

function removeParam(index: number) {
  params.value.splice(index, 1)
}

const templateCache = new Map<string, ParamTemplate[]>()

async function loadTemplates(categoryId: string) {
  if (!templateCache.has(categoryId)) templateCache.set(categoryId, await categoryApi.templates(categoryId))
  return templateCache.get(categoryId)!
}

/**
 * Keys are internal ids (they line parameters up on the site's compare page), so users never type them.
 * A new row takes the key of the category template with the same name, else one derived from the English
 * name, made unique within the machine.
 */
async function ensureParamKeys() {
  const templates = form.categoryId ? await loadTemplates(form.categoryId).catch(() => []) : []
  const used = new Set(params.value.map((p) => p.key).filter((k) => PARAM_KEY_RE.test(k)))
  for (const p of params.value) {
    if (PARAM_KEY_RE.test(p.key)) continue
    const zh = p.labelZh.trim()
    const en = p.labelEn.trim().toLowerCase()
    const tpl = templates.find((t) => (zh && t.labelZh === zh) || (en && t.labelEn.toLowerCase() === en))
    const base = (tpl && !used.has(tpl.key) ? tpl.key : toParamKey(p.labelEn)) || 'param'
    let key = base
    for (let n = 2; used.has(key); n++) key = `${base.slice(0, 60)}_${n}`
    p.key = key
    used.add(key)
  }
}

async function applyTemplate(silentWhenEmpty = false) {
  if (!form.categoryId) {
    ElMessage.warning('请先选择分类')
    return
  }
  try {
    const templates = await loadTemplates(form.categoryId)
    if (!templates.length) {
      if (!silentWhenEmpty) ElMessage.info('该分类暂无参数模板')
      return
    }
    const existing = new Set(params.value.map((p) => p.key))
    const missing = templates.filter((t) => !existing.has(t.key))
    for (const t of missing) {
      params.value.push(toRow({ key: t.key, labelZh: t.labelZh, labelEn: t.labelEn, valueZh: '', valueEn: '' }))
    }
    ElMessage.success(missing.length ? `已添加 ${missing.length} 个模板参数` : '模板参数已全部存在')
  } catch {
    // Error toast comes from the http interceptor.
  }
}

async function onCategoryChange(categoryId: string) {
  if (!isNew.value || params.value.length || !categoryId) return
  try {
    const templates = await loadTemplates(categoryId)
    if (!templates.length || form.categoryId !== categoryId || params.value.length) return
    const name = categories.value.find((c) => c.id === categoryId)?.nameZh ?? ''
    await ElMessageBox.confirm(`分类「${name}」有 ${templates.length} 个参数模板，是否套用？`, '套用参数模板', {
      confirmButtonText: '套用',
      cancelButtonText: '暂不',
      type: 'info',
    })
    await applyTemplate()
  } catch {
    // Dismissed or failed; nothing to do.
  }
}

// ---------- images ----------

function addMedia(list: MediaItem[]) {
  const existing = new Set(images.value.map((i) => i.mediaId))
  for (const m of list) {
    if (existing.has(m.id)) continue
    existing.add(m.id)
    images.value.push({ mediaId: m.id, url: m.url, width: m.width, height: m.height, isCover: false })
  }
  ensureCover()
}

function ensureCover() {
  const first = images.value[0]
  if (first && !images.value.some((i) => i.isCover)) first.isCover = true
}

function setCover(index: number) {
  images.value.forEach((img, i) => (img.isCover = i === index))
}

function removeImage(index: number) {
  images.value.splice(index, 1)
  ensureCover()
}

// ---------- load / save ----------

function buildPayload(): MachineInput {
  const coverIndex = images.value.findIndex((i) => i.isCover)
  return {
    slug: form.slug.trim(),
    model: form.model.trim(),
    categoryId: form.categoryId,
    nameZh: form.nameZh.trim(),
    nameEn: form.nameEn.trim(),
    summaryZh: form.summaryZh,
    summaryEn: form.summaryEn,
    status: form.status,
    featured: form.featured,
    seoTitleZh: form.seoTitleZh.trim(),
    seoTitleEn: form.seoTitleEn.trim(),
    seoDescZh: form.seoDescZh.trim(),
    seoDescEn: form.seoDescEn.trim(),
    notes: form.notes,
    params: params.value.map(({ key, labelZh, labelEn, valueZh, valueEn }) => ({
      key: key.trim(),
      labelZh: labelZh.trim(),
      labelEn: labelEn.trim(),
      valueZh: valueZh.trim(),
      valueEn: valueEn.trim(),
    })),
    images: images.value.map((img, i) => ({
      mediaId: img.mediaId,
      isCover: coverIndex === -1 ? i === 0 : i === coverIndex,
    })),
  }
}

const snapshot = ref('')
const ready = ref(false)
const dirty = computed(() => ready.value && canEdit.value && JSON.stringify(buildPayload()) !== snapshot.value)

function fill(m: MachineDetail | null) {
  detail.value = m
  Object.assign(form, {
    model: m?.model ?? '',
    slug: m?.slug ?? '',
    categoryId: m?.categoryId ?? '',
    nameZh: m?.nameZh ?? '',
    nameEn: m?.nameEn ?? '',
    summaryZh: m?.summaryZh ?? '',
    summaryEn: m?.summaryEn ?? '',
    status: m?.status ?? 'DRAFT',
    featured: m?.featured ?? false,
    seoTitleZh: m?.seoTitleZh ?? '',
    seoTitleEn: m?.seoTitleEn ?? '',
    seoDescZh: m?.seoDescZh ?? '',
    seoDescEn: m?.seoDescEn ?? '',
    notes: m?.notes ?? '',
  })
  params.value = (m?.params ?? []).map(toRow)
  images.value = (m?.images ?? []).map((i) => ({ ...i }))
  slugTouched.value = !!m
  slugState.value = m ? 'ok' : 'idle'
  submitted.value = false
  snapshot.value = JSON.stringify(buildPayload())
  formRef.value?.clearValidate()
}

async function init() {
  ready.value = false
  notFound.value = false
  loading.value = true
  try {
    const [cats, machine] = await Promise.all([
      categoryApi.list().catch(() => [] as Category[]),
      machineId.value ? machineApi.get(machineId.value) : Promise.resolve(null),
    ])
    categories.value = cats
    fill(machine)
    if (!machine) {
      const preset = route.query.categoryId
      if (typeof preset === 'string' && cats.some((c) => c.id === preset)) {
        form.categoryId = preset
        snapshot.value = JSON.stringify(buildPayload())
      }
    }
    ready.value = true
  } catch (e) {
    if (errorStatus(e) === 404) notFound.value = true
  } finally {
    loading.value = false
  }
}

watch(() => route.params.id, () => {
  if (route.name === 'machine-new' || route.name === 'machine-edit') init()
}, { immediate: true })

let leavingAfterSave = false

async function save(back: boolean) {
  if (saving.value) return
  submitted.value = true
  const basicOk = await formRef.value?.validate().catch(() => false)
  if (!basicOk) {
    const slugOk = await formRef.value?.validateField('slug').then(() => true).catch(() => false)
    if (!slugOk && !extraPanels.value.includes('url')) extraPanels.value.push('url')
    ElMessage.error(slugOk ? '请检查基本信息中标红的字段' : '网址设置有问题，已为你展开「网址设置」')
    return
  }
  if (paramIssues.value.size) {
    ElMessage.error(`参数表有 ${paramIssues.value.size} 行没填完整，请看标红的行`)
    return
  }
  if (slugState.value === 'checking') {
    ElMessage.info('正在检查网址是否可用，请稍候再保存')
    return
  }
  await ensureParamKeys()

  saving.value = true
  try {
    const payload = buildPayload()
    const saved = machineId.value
      ? await machineApi.update(machineId.value, payload)
      : await machineApi.create(payload)
    const warnEn = missingValueEn.value
    ElMessage.success(warnEn ? `已保存（${warnEn} 个参数缺少英文值）` : '已保存')
    fill(saved)
    if (back) {
      leavingAfterSave = true
      await router.push('/machines')
    } else if (isNew.value) {
      leavingAfterSave = true
      await router.replace(`/machines/${saved.id}`)
    }
  } catch {
    // 400 / 409 messages are shown by the http interceptor.
  } finally {
    saving.value = false
    leavingAfterSave = false
  }
}

function cancel() {
  router.push('/machines')
}

onBeforeRouteLeave(async () => {
  if (leavingAfterSave || !dirty.value) return true
  try {
    await ElMessageBox.confirm('当前修改尚未保存，确定离开吗？', '未保存的修改', {
      type: 'warning',
      confirmButtonText: '离开',
      cancelButtonText: '继续编辑',
    })
    return true
  } catch {
    return false
  }
})

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (!dirty.value) return
  e.preventDefault()
  e.returnValue = ''
}

onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
  clearTimeout(slugTimer)
})
</script>

<template>
  <el-result v-if="notFound" icon="warning" title="机型不存在" sub-title="该机型可能已被删除。">
    <template #extra>
      <el-button type="primary" @click="router.push('/machines')">返回列表</el-button>
    </template>
  </el-result>

  <div v-else v-loading="loading" class="edit">
    <el-alert v-if="!canEdit" type="info" :closable="false" show-icon title="当前账号为只读权限，无法修改机型。" class="block" />

    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      :disabled="!canEdit"
      label-position="top"
      @submit.prevent
    >
      <!-- 基本信息 -->
      <section class="page-card block">
        <h2 class="section-title">
          基本信息
          <span v-if="detail" class="meta">
            创建于 {{ formatTime(detail.createdAt) }} · 更新于 {{ formatTime(detail.updatedAt) }}
          </span>
        </h2>
        <el-row :gutter="16">
          <el-col :xs="24" :md="12">
            <el-form-item label="型号" prop="model">
              <el-input v-model="form.model" maxlength="64" placeholder="例如 KL-Y100" />
              <div class="field-hint">
                显示在网站上，同时自动生成机型网址：<code>/zh/products/{{ form.slug || '…' }}/</code>
                <el-button v-if="canEdit" link type="primary" size="small" @click="openUrlPanel">修改网址</el-button>
              </div>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="12">
            <el-form-item label="分类" prop="categoryId">
              <el-select v-model="form.categoryId" placeholder="选择分类" style="width: 100%" @change="onCategoryChange">
                <el-option v-for="c in categories" :key="c.id" :label="c.nameZh" :value="c.id" />
              </el-select>
              <div class="field-hint">新建机型选好分类后，可一键套用该分类的参数模板。</div>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="12">
            <el-form-item label="中文名" prop="nameZh">
              <el-input v-model="form.nameZh" maxlength="200" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="12">
            <el-form-item label="英文名" prop="nameEn" :class="{ 'en-missing': !form.nameEn.trim() }">
              <el-input v-model="form.nameEn" maxlength="200" placeholder="English name" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="12">
            <el-form-item label="中文简介">
              <el-input v-model="form.summaryZh" type="textarea" :rows="4" maxlength="5000" show-word-limit />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="12">
            <el-form-item label="英文简介">
              <el-input v-model="form.summaryEn" type="textarea" :rows="4" maxlength="5000" show-word-limit />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="12">
            <el-form-item label="状态">
              <el-radio-group v-model="form.status">
                <el-radio v-for="[value, label] in statusOptions" :key="value" :value="value">{{ label }}</el-radio>
              </el-radio-group>
              <div class="field-hint">
                草稿：只在后台可见；已发布：在「发布中心」发布后显示在网站上；已隐藏：从网站下架但保留资料。
              </div>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="12">
            <el-form-item label="首页推荐">
              <el-switch v-model="form.featured" active-text="推荐" inactive-text="不推荐" />
              <div class="field-hint">打开后，该机型会出现在网站首页的推荐机型里。</div>
            </el-form-item>
          </el-col>
        </el-row>
      </section>

      <!-- 参数 -->
      <section class="page-card block">
        <h2 class="section-title">
          参数
          <span class="meta">{{ params.length }} 项</span>
          <span v-if="missingValueEn" class="meta text-danger">{{ missingValueEn }} 项缺少英文值</span>
        </h2>
        <div v-if="canEdit" class="page-toolbar">
          <el-button :icon="Plus" @click="addParam">添加参数</el-button>
          <el-button @click="applyTemplate()">套用分类模板</el-button>
          <span class="tip">每行填写参数名和参数值即可，例如「称重范围 / Weighing Range / 1-100克 / 1-100g」。英文用于英文版网站；拖动左侧图标可调整顺序。</span>
        </div>
        <div class="table-scroll">
          <VueDraggable v-model="params" target="tbody" handle=".drag-handle" :animation="150" :disabled="!canEdit">
            <table class="param-table">
              <thead>
                <tr>
                  <th class="col-handle"></th>
                  <th>中文参数名</th>
                  <th>英文参数名</th>
                  <th>中文值</th>
                  <th>英文值</th>
                  <th v-if="canEdit" class="col-op"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, index) in params" :key="row.uid" :class="{ invalid: paramIssues.has(row.uid) }">
                  <td class="col-handle">
                    <el-icon v-if="canEdit" class="drag-handle" :size="16"><Rank /></el-icon>
                  </td>
                  <td>
                    <el-input v-model="row.labelZh" size="small" maxlength="100" placeholder="如 称重范围" />
                    <div v-if="paramIssues.get(row.uid)" class="row-error">{{ paramIssues.get(row.uid) }}</div>
                  </td>
                  <td :class="{ 'cell-missing': !row.labelEn.trim() }">
                    <el-input v-model="row.labelEn" size="small" maxlength="100" placeholder="如 Weighing Range" />
                  </td>
                  <td><el-input v-model="row.valueZh" size="small" maxlength="500" placeholder="如 1-100克" /></td>
                  <td :class="{ 'cell-missing': !row.valueEn.trim() }">
                    <el-input v-model="row.valueEn" size="small" maxlength="500" placeholder="如 1-100g" />
                  </td>
                  <td v-if="canEdit" class="col-op">
                    <el-button link type="danger" :icon="Delete" aria-label="删除参数" @click="removeParam(index)" />
                  </td>
                </tr>
              </tbody>
            </table>
          </VueDraggable>
          <el-empty v-if="!params.length" :image-size="60" description="暂无参数" />
        </div>
      </section>

      <!-- 图片 -->
      <section class="page-card block">
        <h2 class="section-title">
          图片
          <span class="meta">{{ images.length }} 张，可拖动调整展示顺序</span>
        </h2>
        <div v-if="canEdit" class="page-toolbar">
          <el-button :icon="Picture" @click="pickerOpen = true">从媒体库选择</el-button>
          <el-button :icon="Upload" @click="uploadOpen = true">上传图片</el-button>
        </div>
        <VueDraggable v-model="images" class="image-grid" :animation="150" :disabled="!canEdit">
          <div v-for="(img, index) in images" :key="img.mediaId" class="image-tile" :class="{ cover: img.isCover }">
            <img :src="img.url" alt="" loading="lazy" />
            <span v-if="img.isCover" class="cover-badge">封面</span>
            <span class="dim">{{ img.width }}×{{ img.height }}</span>
            <div v-if="canEdit" class="tile-actions">
              <el-button v-if="!img.isCover" size="small" :icon="Star" @click="setCover(index)">设为封面</el-button>
              <el-button size="small" type="danger" :icon="Delete" @click="removeImage(index)">移除</el-button>
            </div>
          </div>
        </VueDraggable>
        <el-empty v-if="!images.length" :image-size="60" description="暂无图片" />
      </section>

      <!-- SEO / 备注 -->
      <section class="page-card block">
        <el-collapse v-model="extraPanels">
          <el-collapse-item title="网址设置（一般无需修改）" name="url">
            <p class="tip">
              网址名称会根据型号自动生成，只能包含小写英文字母、数字和短横线。机型上线后不建议再改，否则客户收藏的旧链接会失效。
            </p>
            <el-form-item label="网址名称" prop="slug">
              <el-input v-model="form.slug" maxlength="64" placeholder="根据型号自动生成" @input="onSlugInput">
                <template #suffix>
                  <span v-if="slugState === 'checking'" class="slug-state">检查中…</span>
                  <span v-else-if="slugState === 'ok'" class="slug-state ok">可用</span>
                  <span v-else-if="slugState === 'taken'" class="slug-state bad">已被占用</span>
                </template>
              </el-input>
              <div class="field-hint">
                完整网址：<code>/zh/products/{{ form.slug || '…' }}/</code>
                <el-button v-if="slugTouched && canEdit && form.model" link type="primary" size="small" @click="resetSlugToModel">
                  按型号重新生成
                </el-button>
              </div>
            </el-form-item>
          </el-collapse-item>
          <el-collapse-item title="SEO 设置（搜索引擎显示的标题和描述，可不填）" name="seo">
            <el-row :gutter="16">
              <el-col :xs="24" :md="12">
                <el-form-item label="SEO 标题（中文）">
                  <el-input v-model="form.seoTitleZh" maxlength="200" show-word-limit placeholder="留空则使用中文名" />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :md="12">
                <el-form-item label="SEO 标题（英文）">
                  <el-input v-model="form.seoTitleEn" maxlength="200" show-word-limit placeholder="留空则使用英文名" />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :md="12">
                <el-form-item label="SEO 描述（中文）">
                  <el-input v-model="form.seoDescZh" type="textarea" :rows="3" maxlength="500" show-word-limit />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :md="12">
                <el-form-item label="SEO 描述（英文）">
                  <el-input v-model="form.seoDescEn" type="textarea" :rows="3" maxlength="500" show-word-limit />
                </el-form-item>
              </el-col>
            </el-row>
          </el-collapse-item>
          <el-collapse-item title="内部备注" name="notes">
            <p class="tip">仅供后台人员查看，永远不会显示在网站上。</p>
            <el-input v-model="form.notes" type="textarea" :rows="4" maxlength="5000" show-word-limit />
          </el-collapse-item>
        </el-collapse>
      </section>
    </el-form>

    <div class="action-bar">
      <span v-if="dirty" class="dirty">有未保存的修改</span>
      <span class="spacer" />
      <template v-if="canEdit">
        <el-button :disabled="saving" @click="cancel">取消</el-button>
        <el-button :loading="saving" @click="save(true)">保存并返回列表</el-button>
        <el-button type="primary" :loading="saving" @click="save(false)">保存</el-button>
      </template>
      <el-button v-else @click="cancel">返回列表</el-button>
    </div>

    <MediaPicker v-model="pickerOpen" :exclude-ids="images.map((i) => i.mediaId)" @select="addMedia" />
    <CropUpload v-model="uploadOpen" usage="machine" @uploaded="(m) => addMedia([m])" />
  </div>
</template>

<style scoped>
.block {
  margin-bottom: 16px;
}

.section-title {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 12px;
  margin: 0 0 16px;
  font-size: 16px;
  font-weight: 600;
}

.section-title .meta {
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}

.section-title .meta.text-danger {
  color: var(--el-color-danger);
}

.field-hint {
  width: 100%;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.field-hint code {
  padding: 0 4px;
  border-radius: 3px;
  background: var(--el-fill-color-light);
}

.slug-state {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.slug-state.ok {
  color: var(--el-color-success);
}

.slug-state.bad {
  color: var(--el-color-danger);
}

.en-missing :deep(.el-input__wrapper),
.cell-missing :deep(.el-input__wrapper) {
  background: var(--el-color-danger-light-9);
}

.tip {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.table-scroll {
  overflow-x: auto;
}

.param-table {
  width: 100%;
  min-width: 860px;
  border-collapse: collapse;
}

.param-table th,
.param-table td {
  padding: 6px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  text-align: left;
  vertical-align: top;
}

.param-table th {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-lighter);
}

.param-table .col-handle {
  width: 32px;
  text-align: center;
  padding-top: 10px;
}

.param-table .col-op {
  width: 44px;
  text-align: center;
}

.param-table tr.invalid td {
  background: var(--el-color-danger-light-9);
}

.row-error {
  margin-top: 2px;
  font-size: 12px;
  line-height: 1.3;
  color: var(--el-color-danger);
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}

.image-tile {
  position: relative;
  aspect-ratio: 1;
  border: 2px solid var(--el-border-color);
  border-radius: 8px;
  overflow: hidden;
  background: #f8fafc;
  cursor: grab;
  transition: all 0.2s ease;
}

.image-tile:hover {
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.08);
  border-color: #cbd5e1;
}

.image-tile.cover {
  border-color: var(--el-color-warning);
}

.image-tile img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  pointer-events: none;
}

.cover-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background: var(--el-color-warning);
  box-shadow: 0 2px 4px rgba(245, 158, 11, 0.3);
}

.dim {
  position: absolute;
  top: 6px;
  right: 6px;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 11px;
  color: #fff;
  background: rgba(15, 23, 42, 0.65);
}

.tile-actions {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: center;
  gap: 4px;
  padding: 6px;
  background: rgba(15, 23, 42, 0.65);
  backdrop-filter: blur(4px);
}

.tile-actions .el-button + .el-button {
  margin-left: 0;
}

.action-bar {
  position: sticky;
  bottom: 12px;
  z-index: 10;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 14px 20px;
  margin-top: 16px;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--el-border-color);
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.04);
  border-radius: 12px;
}

.action-bar .spacer {
  flex: 1;
}

.action-bar .el-button + .el-button {
  margin-left: 0;
}

.dirty {
  font-size: 13px;
  color: var(--el-color-warning);
}
</style>
