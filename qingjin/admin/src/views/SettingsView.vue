<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type FormInstance, type FormItemRule, type FormRules } from 'element-plus'
import { Delete, Picture, Rank, Upload } from '@element-plus/icons-vue'
import { VueDraggable } from 'vue-draggable-plus'
import CropUpload from '@/components/CropUpload.vue'
import MediaPicker from '@/components/MediaPicker.vue'
import { settingsApi } from '@/api'
import { useCanEdit } from '@/composables/useCanEdit'
import type {
  Certificate,
  FactoryPhoto,
  Localized,
  MediaItem,
  SiteImageRef,
  SiteSettings,
  SiteSettingsResponse,
} from '@/types/api'
import { formatTime } from '@/utils/format'

type PhotoRow = FactoryPhoto & { uid: number }
type CertRow = Certificate & { uid: number }
type PickTarget = 'about' | 'wechat' | 'factory' | 'cert'

const MAX_ITEMS = 30
const CERT_TYPES = ['CE Certificate', 'CE Compliance', 'Inspection Report']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const router = useRouter()
const canEdit = useCanEdit()

const loading = ref(false)
const saving = ref(false)
const loadFailed = ref(false)
const updatedAt = ref<string | null>(null)
const formRef = ref<FormInstance>()

const emptyL = (): Localized => ({ zh: '', en: '' })
const form = reactive({
  name: emptyL(),
  tagline: emptyL(),
  factoryPitch: emptyL(),
  certPitch: emptyL(),
  address: emptyL(),
  contact: { phone: '', email: '', whatsapp: '', wechat: '' },
  formEndpoint: '',
})
const aboutImage = ref<SiteImageRef | null>(null)
const wechatQr = ref<SiteImageRef | null>(null)
const factoryPhotos = ref<PhotoRow[]>([])
const certificates = ref<CertRow[]>([])

let uidSeq = 0

const textFields = [
  { key: 'name', label: '公司名称', max: 100, textarea: false },
  { key: 'tagline', label: '口号 / 副标题', max: 200, textarea: false },
  { key: 'factoryPitch', label: '工厂介绍语', max: 200, textarea: true },
  { key: 'certPitch', label: '资质介绍语', max: 200, textarea: true },
  { key: 'address', label: '地址', max: 300, textarea: true },
] as const

const contactFields = [
  { key: 'phone', label: '电话', placeholder: '+86 ...' },
  { key: 'email', label: '邮箱', placeholder: 'sales@example.com' },
  { key: 'whatsapp', label: 'WhatsApp', placeholder: '含国家区号，如 +8613800000000' },
  { key: 'wechat', label: '微信', placeholder: '微信号' },
] as const

// ---------- validation ----------

const emailValidator: FormItemRule['validator'] = (_r, value: string, cb) => {
  if (value && !EMAIL_RE.test(value.trim())) return cb(new Error('邮箱格式不正确'))
  cb()
}

const rules: FormRules = {
  'name.zh': [{ required: true, whitespace: true, message: '请输入中文公司名称', trigger: 'blur' }],
  'name.en': [{ required: true, whitespace: true, message: '请输入英文公司名称', trigger: 'blur' }],
  'contact.email': [{ validator: emailValidator, trigger: 'blur' }],
}

// ---------- load / serialize ----------

const trimL = (l: Localized): Localized => ({ zh: l.zh.trim(), en: l.en.trim() })

function buildPayload(): SiteSettings {
  return {
    name: trimL(form.name),
    tagline: trimL(form.tagline),
    factoryPitch: trimL(form.factoryPitch),
    certPitch: trimL(form.certPitch),
    address: trimL(form.address),
    contact: {
      phone: form.contact.phone.trim(),
      email: form.contact.email.trim(),
      whatsapp: form.contact.whatsapp.trim(),
      wechat: form.contact.wechat.trim(),
    },
    formEndpoint: form.formEndpoint.trim(),
    aboutImage: aboutImage.value ? { mediaId: aboutImage.value.mediaId, url: aboutImage.value.url } : null,
    wechatQr: wechatQr.value ? { mediaId: wechatQr.value.mediaId, url: wechatQr.value.url } : null,
    factoryPhotos: factoryPhotos.value.map((p) => ({
      mediaId: p.mediaId,
      url: p.url,
      title: trimL(p.title),
      desc: trimL(p.desc),
    })),
    certificates: certificates.value.map((c) => ({
      mediaId: c.mediaId,
      url: c.url,
      title: trimL(c.title),
      type: c.type.trim(),
    })),
  }
}

const snapshot = ref('')
const ready = ref(false)
const dirty = computed(() => ready.value && canEdit.value && JSON.stringify(buildPayload()) !== snapshot.value)

const copyL = (l: Localized | undefined): Localized => ({ zh: l?.zh ?? '', en: l?.en ?? '' })

function fill(s: SiteSettingsResponse) {
  form.name = copyL(s.name)
  form.tagline = copyL(s.tagline)
  form.factoryPitch = copyL(s.factoryPitch)
  form.certPitch = copyL(s.certPitch)
  form.address = copyL(s.address)
  form.contact = {
    phone: s.contact?.phone ?? '',
    email: s.contact?.email ?? '',
    whatsapp: s.contact?.whatsapp ?? '',
    wechat: s.contact?.wechat ?? '',
  }
  form.formEndpoint = s.formEndpoint ?? ''
  aboutImage.value = s.aboutImage ? { ...s.aboutImage } : null
  wechatQr.value = s.wechatQr ? { ...s.wechatQr } : null
  factoryPhotos.value = (s.factoryPhotos ?? []).map((p) => ({
    mediaId: p.mediaId,
    url: p.url,
    title: copyL(p.title),
    desc: copyL(p.desc),
    uid: ++uidSeq,
  }))
  certificates.value = (s.certificates ?? []).map((c) => ({
    mediaId: c.mediaId,
    url: c.url,
    title: copyL(c.title),
    type: c.type ?? '',
    uid: ++uidSeq,
  }))
  updatedAt.value = s.updatedAt
  snapshot.value = JSON.stringify(buildPayload())
  formRef.value?.clearValidate()
}

async function load() {
  loading.value = true
  loadFailed.value = false
  try {
    fill(await settingsApi.getSite())
    ready.value = true
  } catch {
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}

// ---------- images ----------

const pickerOpen = ref(false)
const uploadOpen = ref(false)
const target = ref<PickTarget>('factory')

const pickerExclude = computed(() => {
  if (target.value === 'factory') return factoryPhotos.value.map((p) => p.mediaId)
  if (target.value === 'cert') return certificates.value.map((c) => c.mediaId)
  return []
})

function openPicker(t: PickTarget) {
  if (!canAdd(t)) return
  target.value = t
  pickerOpen.value = true
}

function openUpload(t: PickTarget) {
  if (!canAdd(t)) return
  target.value = t
  uploadOpen.value = true
}

function canAdd(t: PickTarget) {
  const list = t === 'factory' ? factoryPhotos.value : t === 'cert' ? certificates.value : null
  if (list && list.length >= MAX_ITEMS) {
    ElMessage.warning(`最多 ${MAX_ITEMS} 张`)
    return false
  }
  return true
}

function addMedia(items: MediaItem[]) {
  if (target.value === 'about') {
    const m = items[0]
    if (m) aboutImage.value = { mediaId: m.id, url: m.url }
    return
  }
  if (target.value === 'wechat') {
    const m = items[0]
    if (m) wechatQr.value = { mediaId: m.id, url: m.url }
    return
  }
  const list = target.value === 'factory' ? factoryPhotos.value : certificates.value
  const room = MAX_ITEMS - list.length
  const fresh = items.filter((m) => !list.some((x) => x.mediaId === m.id)).slice(0, Math.max(0, room))
  if (fresh.length < items.length) ElMessage.warning(`已跳过重复图片或超出 ${MAX_ITEMS} 张上限的部分`)
  for (const m of fresh) {
    if (target.value === 'factory') {
      factoryPhotos.value.push({ mediaId: m.id, url: m.url, title: emptyL(), desc: emptyL(), uid: ++uidSeq })
    } else {
      certificates.value.push({ mediaId: m.id, url: m.url, title: emptyL(), type: '', uid: ++uidSeq })
    }
  }
}

const certTypeSuggestions = (query: string, cb: (items: { value: string }[]) => void) => {
  const q = query.trim().toLowerCase()
  cb(CERT_TYPES.filter((t) => !q || t.toLowerCase().includes(q)).map((value) => ({ value })))
}

// ---------- save / leave ----------

let leavingAfterSave = false

async function save() {
  if (saving.value) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) {
    ElMessage.error('请检查标红的字段')
    return
  }
  saving.value = true
  try {
    fill(await settingsApi.saveSite(buildPayload()))
    ElMessage({
      type: 'success',
      duration: 6000,
      showClose: true,
      message: h('span', [
        '站点设置已保存，发布后在网站生效。',
        h(
          'a',
          {
            href: '#',
            style: 'margin-left:8px;color:var(--el-color-primary)',
            onClick: (e: Event) => {
              e.preventDefault()
              leavingAfterSave = true
              router.push('/releases').finally(() => (leavingAfterSave = false))
            },
          },
          '去发布中心',
        ),
      ]),
    })
  } catch {
    // 400 messages (e.g. missing media) are shown by the http interceptor.
  } finally {
    saving.value = false
  }
}

function discard() {
  ElMessageBox.confirm('放弃所有未保存的修改？', '提示', { type: 'warning' })
    .then(load)
    .catch(() => undefined)
}

onBeforeRouteLeave(async () => {
  if (leavingAfterSave || !dirty.value) return true
  try {
    await ElMessageBox.confirm('站点设置尚未保存，确定离开吗？', '未保存的修改', {
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

onMounted(() => {
  window.addEventListener('beforeunload', onBeforeUnload)
  load()
})
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))
</script>

<template>
  <el-result v-if="loadFailed" icon="error" title="站点设置加载失败">
    <template #extra>
      <el-button type="primary" @click="load">重试</el-button>
    </template>
  </el-result>

  <div v-else v-loading="loading" class="settings">
    <el-alert
      v-if="!canEdit"
      type="info"
      :closable="false"
      show-icon
      title="当前账号为只读权限，无法修改站点设置。"
      class="block"
    />
    <p class="updated">
      最后保存：{{ updatedAt ? formatTime(updatedAt) : '从未保存' }} · 修改保存后需在「发布中心」发布才会在网站生效。
    </p>

    <el-form ref="formRef" :model="form" :rules="rules" :disabled="!canEdit" label-position="top" @submit.prevent>
      <!-- 基本信息 -->
      <section class="page-card block">
        <h2 class="section-title">基本信息</h2>
        <el-row v-for="f in textFields" :key="f.key" :gutter="16">
          <el-col :xs="24" :md="12">
            <el-form-item :label="`${f.label}（中文）`" :prop="`${f.key}.zh`">
              <el-input
                v-model="form[f.key].zh"
                :type="f.textarea ? 'textarea' : 'text'"
                :rows="2"
                :maxlength="f.max"
                show-word-limit
              />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="12">
            <el-form-item :label="`${f.label}（英文）`" :prop="`${f.key}.en`">
              <el-input
                v-model="form[f.key].en"
                :type="f.textarea ? 'textarea' : 'text'"
                :rows="2"
                :maxlength="f.max"
                show-word-limit
              />
            </el-form-item>
          </el-col>
        </el-row>
      </section>

      <!-- 联系方式 -->
      <section class="page-card block">
        <h2 class="section-title">联系方式</h2>
        <el-row :gutter="16">
          <el-col v-for="f in contactFields" :key="f.key" :xs="24" :sm="12" :md="6">
            <el-form-item :label="f.label" :prop="`contact.${f.key}`">
              <el-input v-model="form.contact[f.key]" maxlength="100" :placeholder="f.placeholder" />
            </el-form-item>
          </el-col>
        </el-row>
      </section>

      <!-- 微信二维码 -->
      <section class="page-card block">
        <h2 class="section-title">微信二维码 <span class="meta">显示在网站「联系我们」页，未设置时显示占位图</span></h2>
        <div class="about">
          <div class="qr-preview">
            <img v-if="wechatQr" :src="wechatQr.url" alt="" />
            <div v-else class="placeholder"><el-icon :size="32"><Picture /></el-icon><span>未设置</span></div>
          </div>
          <div v-if="canEdit" class="about-actions">
            <el-button :icon="Picture" @click="openPicker('wechat')">从媒体库选择</el-button>
            <el-button :icon="Upload" @click="openUpload('wechat')">上传二维码</el-button>
            <el-button v-if="wechatQr" type="danger" plain :icon="Delete" @click="wechatQr = null">移除</el-button>
          </div>
        </div>
      </section>

      <!-- 关于页大图 -->
      <section class="page-card block">
        <h2 class="section-title">关于页大图</h2>
        <div class="about">
          <div class="about-preview">
            <img v-if="aboutImage" :src="aboutImage.url" alt="" />
            <div v-else class="placeholder"><el-icon :size="32"><Picture /></el-icon><span>未设置</span></div>
          </div>
          <div v-if="canEdit" class="about-actions">
            <el-button :icon="Picture" @click="openPicker('about')">从媒体库选择</el-button>
            <el-button :icon="Upload" @click="openUpload('about')">上传图片</el-button>
            <el-button v-if="aboutImage" type="danger" plain :icon="Delete" @click="aboutImage = null">移除</el-button>
          </div>
        </div>
      </section>

      <!-- 工厂照片 -->
      <section class="page-card block">
        <h2 class="section-title">
          工厂照片 <span class="meta">{{ factoryPhotos.length }} / {{ MAX_ITEMS }}，拖动左侧图标排序</span>
        </h2>
        <div v-if="canEdit" class="page-toolbar">
          <el-button :icon="Picture" @click="openPicker('factory')">从媒体库选择</el-button>
          <el-button :icon="Upload" @click="openUpload('factory')">上传图片</el-button>
        </div>
        <VueDraggable v-model="factoryPhotos" handle=".drag-handle" :animation="150" :disabled="!canEdit" class="rows">
          <div v-for="(p, index) in factoryPhotos" :key="p.uid" class="row">
            <el-icon v-if="canEdit" class="drag-handle" :size="18"><Rank /></el-icon>
            <img :src="p.url" alt="" class="thumb landscape" />
            <div class="fields">
              <el-input v-model="p.title.zh" maxlength="100" placeholder="标题（中文）" />
              <el-input v-model="p.title.en" maxlength="100" placeholder="标题（英文）" />
              <el-input v-model="p.desc.zh" type="textarea" :rows="2" maxlength="300" placeholder="说明（中文）" />
              <el-input v-model="p.desc.en" type="textarea" :rows="2" maxlength="300" placeholder="说明（英文）" />
            </div>
            <el-button
              v-if="canEdit"
              link
              type="danger"
              :icon="Delete"
              aria-label="移除"
              class="remove"
              @click="factoryPhotos.splice(index, 1)"
            />
          </div>
        </VueDraggable>
        <el-empty v-if="!factoryPhotos.length" :image-size="60" description="暂无工厂照片" />
      </section>

      <!-- 证书 -->
      <section class="page-card block">
        <h2 class="section-title">
          证书 <span class="meta">{{ certificates.length }} / {{ MAX_ITEMS }}，拖动左侧图标排序</span>
        </h2>
        <div v-if="canEdit" class="page-toolbar">
          <el-button :icon="Picture" @click="openPicker('cert')">从媒体库选择</el-button>
          <el-button :icon="Upload" @click="openUpload('cert')">上传图片</el-button>
        </div>
        <VueDraggable v-model="certificates" handle=".drag-handle" :animation="150" :disabled="!canEdit" class="rows">
          <div v-for="(c, index) in certificates" :key="c.uid" class="row">
            <el-icon v-if="canEdit" class="drag-handle" :size="18"><Rank /></el-icon>
            <img :src="c.url" alt="" class="thumb portrait" />
            <div class="fields">
              <el-input v-model="c.title.zh" maxlength="200" placeholder="证书名称（中文）" />
              <el-input v-model="c.title.en" maxlength="200" placeholder="证书名称（英文）" />
              <el-autocomplete
                v-model="c.type"
                :fetch-suggestions="certTypeSuggestions"
                :maxlength="50"
                placeholder="类型，如 CE Certificate"
                class="full"
              />
            </div>
            <el-button
              v-if="canEdit"
              link
              type="danger"
              :icon="Delete"
              aria-label="移除"
              class="remove"
              @click="certificates.splice(index, 1)"
            />
          </div>
        </VueDraggable>
        <el-empty v-if="!certificates.length" :image-size="60" description="暂无证书" />
      </section>
    </el-form>

    <div v-if="canEdit" class="action-bar">
      <span v-if="dirty" class="dirty">有未保存的修改</span>
      <span class="spacer" />
      <el-button :disabled="saving || !dirty" @click="discard">放弃修改</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存</el-button>
    </div>

    <MediaPicker
      v-model="pickerOpen"
      usage="site"
      :multiple="target === 'factory' || target === 'cert'"
      :exclude-ids="pickerExclude"
      @select="addMedia"
    />
    <CropUpload
      v-model="uploadOpen"
      usage="site"
      :default-square="target === 'wechat'"
      :title="target === 'cert' ? '上传证书图片' : target === 'about' ? '上传关于页大图' : target === 'wechat' ? '上传微信二维码' : '上传工厂照片'"
      @uploaded="(m) => addMedia([m])"
    />
  </div>
</template>

<style scoped>
.block {
  margin-bottom: 16px;
}

.updated {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
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

.help {
  width: 100%;
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.about {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-start;
}

.about-preview {
  width: 360px;
  max-width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 6px;
  overflow: hidden;
  background: var(--el-fill-color-light);
}

.about-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.placeholder {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--el-text-color-placeholder);
  font-size: 13px;
}

.qr-preview {
  width: 180px;
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  background: var(--el-fill-color-light);
  border: 1px dashed var(--el-border-color);
}

.qr-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  background: #fff;
}

.about-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.about-actions .el-button + .el-button {
  margin-left: 0;
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.row {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 14px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: #ffffff;
  transition: all 0.2s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
}

.row:hover {
  border-color: #cbd5e1;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);
}

.row .drag-handle {
  margin-top: 8px;
  flex-shrink: 0;
}

.thumb {
  flex-shrink: 0;
  border-radius: 6px;
  object-fit: cover;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
}

.thumb.landscape {
  width: 160px;
  height: 100px;
}

.thumb.portrait {
  width: 90px;
  height: 120px;
  object-fit: contain;
}

.fields {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.full {
  width: 100%;
}

.remove {
  margin-top: 6px;
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
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--el-border-color);
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.04);
  border-radius: 12px;
  margin-top: 16px;
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

@media (max-width: 768px) {
  .row {
    flex-wrap: wrap;
  }

  .thumb.landscape {
    width: calc(100% - 30px);
    height: auto;
    aspect-ratio: 16 / 10;
  }

  .fields {
    flex-basis: 100%;
    grid-template-columns: 1fr;
  }
}
</style>
