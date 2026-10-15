<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import { Cropper } from 'vue-advanced-cropper'
import 'vue-advanced-cropper/dist/style.css'
import { mediaApi } from '@/api'
import type { MediaItem, MediaUsage } from '@/types/api'
import { formatBytes } from '@/utils/format'

const props = withDefaults(
  defineProps<{
    usage?: MediaUsage
    title?: string
    /** Initial state of the "方形白底" checkbox; site photos and certificates are not square. */
    defaultSquare?: boolean
    defaultMode?: 'free' | 'square' | 'none'
  }>(),
  {
    usage: 'machine',
    title: '上传图片',
    defaultSquare: true,
    defaultMode: 'free',
  },
)
const visible = defineModel<boolean>({ required: true })
const emit = defineEmits<{ uploaded: [media: MediaItem] }>()

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE = 15 * 1024 * 1024

type CropMode = 'free' | 'square' | 'none'

const file = ref<File | null>(null)
const previewUrl = ref('')
const mode = ref<CropMode>(props.defaultMode)
const square = ref(props.defaultSquare)
const dragOver = ref(false)
const uploading = ref(false)
const progress = ref(0)
const inputRef = ref<HTMLInputElement>()
const cropperRef = ref<InstanceType<typeof Cropper>>()

const stencilProps = computed(() => (mode.value === 'square' ? { aspectRatio: 1 } : {}))
const fullImage = ({ imageSize }: { imageSize: { width: number; height: number } }) => ({
  width: imageSize.width,
  height: imageSize.height,
})

function revoke() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
}

function reset() {
  revoke()
  file.value = null
  mode.value = props.defaultMode
  square.value = props.defaultSquare
  progress.value = 0
  uploading.value = false
  if (inputRef.value) inputRef.value.value = ''
}

watch(visible, (open) => {
  if (!open) return reset()
  // Props may have changed while the dialog was closed (e.g. a different usage).
  mode.value = props.defaultMode
  square.value = props.defaultSquare
})
onBeforeUnmount(revoke)

function accept(candidate: File | undefined) {
  if (!candidate) return
  if (!ACCEPT.includes(candidate.type)) {
    ElMessage.error('仅支持 JPG、PNG、WebP 格式的图片')
    return
  }
  if (candidate.size > MAX_SIZE) {
    ElMessage.error(`图片不能超过 15 MB（当前 ${formatBytes(candidate.size)}）`)
    return
  }
  revoke()
  file.value = candidate
  previewUrl.value = URL.createObjectURL(candidate)
}

function onPick(e: Event) {
  accept((e.target as HTMLInputElement).files?.[0])
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  accept(e.dataTransfer?.files?.[0])
}

function changeFile() {
  inputRef.value?.click()
}

async function upload() {
  if (!file.value) return
  let crop: { x: number; y: number; width: number; height: number } | undefined
  if (mode.value !== 'none') {
    // Coordinates are in natural pixels of the EXIF-oriented image, which is what the server expects.
    const result = cropperRef.value?.getResult()
    const c = result?.coordinates
    if (result && c && c.width > 0 && c.height > 0) {
      // Clamp so rounding never produces a box that extends past the image edge.
      const x = Math.max(0, Math.floor(c.left))
      const y = Math.max(0, Math.floor(c.top))
      const maxW = result.image.width ? result.image.width - x : Infinity
      const maxH = result.image.height ? result.image.height - y : Infinity
      crop = {
        x,
        y,
        width: Math.max(1, Math.min(Math.round(c.width), maxW)),
        height: Math.max(1, Math.min(Math.round(c.height), maxH)),
      }
    }
  }
  uploading.value = true
  progress.value = 0
  try {
    const media = await mediaApi.upload(file.value, { crop, square: square.value, usage: props.usage }, (p) => {
      progress.value = p
    })
    ElMessage.success('上传成功')
    emit('uploaded', media)
    visible.value = false
  } catch {
    // Error toast comes from the http interceptor.
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="title"
    width="760px"
    class="qj-dialog"
    append-to-body
    destroy-on-close
    :close-on-click-modal="!uploading"
    :close-on-press-escape="!uploading"
    :show-close="!uploading"
  >
    <input ref="inputRef" type="file" :accept="ACCEPT.join(',')" hidden @change="onPick" />

    <div
      v-if="!file"
      class="drop"
      :class="{ over: dragOver }"
      @click="changeFile"
      @dragover.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false"
      @drop.prevent="onDrop"
    >
      <el-icon :size="48"><UploadFilled /></el-icon>
      <div>将图片拖到此处，或<em>点击选择</em></div>
      <div class="tip">支持 JPG / PNG / WebP，单张不超过 15 MB</div>
    </div>

    <template v-else>
      <div class="options">
        <el-radio-group v-model="mode" size="small" :disabled="uploading">
          <el-radio-button value="free">自由裁剪</el-radio-button>
          <el-radio-button value="square">1:1</el-radio-button>
          <el-radio-button value="none">不裁剪</el-radio-button>
        </el-radio-group>
        <el-checkbox v-model="square" :disabled="uploading">方形白底</el-checkbox>
        <span class="spacer" />
        <span class="file-name" :title="file.name">{{ file.name }}（{{ formatBytes(file.size) }}）</span>
        <el-button size="small" :disabled="uploading" @click="changeFile">更换图片</el-button>
      </div>

      <div class="stage">
        <Cropper
          v-if="mode !== 'none'"
          ref="cropperRef"
          class="cropper"
          :src="previewUrl"
          :stencil-props="stencilProps"
          :default-size="fullImage"
          :canvas="false"
        />
        <img v-else :src="previewUrl" alt="" class="plain" />
      </div>
      <p class="hint">
        {{ square ? '处理后图片会居中放置在白色正方形画布上，与现有产品图风格一致。' : '保留裁剪后的原始比例。' }}
      </p>
      <el-progress v-if="uploading" :percentage="progress" :stroke-width="10" />
    </template>

    <template #footer>
      <el-button :disabled="uploading" @click="visible = false">取消</el-button>
      <el-button type="primary" :disabled="!file" :loading="uploading" @click="upload">上传</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 260px;
  border: 2px dashed var(--el-border-color);
  border-radius: 8px;
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}

.drop.over,
.drop:hover {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.drop em {
  color: var(--el-color-primary);
  font-style: normal;
}

.drop .tip,
.hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.options {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.spacer {
  flex: 1;
}

.file-name {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.stage {
  height: 420px;
  background: #222;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 6px;
}

.cropper {
  width: 100%;
  height: 100%;
}

.plain {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

@media (max-width: 768px) {
  .stage {
    height: 300px;
  }
}
</style>
