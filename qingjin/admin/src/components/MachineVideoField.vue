<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Delete, Refresh, UploadFilled, VideoCamera } from '@element-plus/icons-vue'
import { videoApi } from '@/api'
import type { MachineVideo } from '@/types/api'
import { formatBytes } from '@/utils/format'

const props = defineProps<{ video: MachineVideo | null; canEdit: boolean }>()
const videoId = defineModel<string | null>({ required: true })
const emit = defineEmits<{ change: [video: MachineVideo | null] }>()

const MAX_SIZE = 600 * 1024 * 1024
const VIDEO_EXT = /\.(mp4|mov|m4v|3gp|webm|mkv|avi)$/i
const RETRIES = 3
const POLL_MS = 4000

const current = ref<MachineVideo | null>(props.video)
const inputRef = ref<HTMLInputElement>()
const dragOver = ref(false)
const uploading = ref(false)
const progress = ref(0)
const speed = ref('')
/** An interrupted upload that can resume from the chunks already on the server. */
const paused = ref<{ file: File; video: MachineVideo } | null>(null)
let controller: AbortController | null = null
let pollTimer: ReturnType<typeof setTimeout> | undefined

const statusTag = computed(() => {
  switch (current.value?.status) {
    case 'READY':
      return { type: 'success' as const, text: '可播放' }
    case 'PROCESSING':
      return { type: 'warning' as const, text: '压缩处理中' }
    case 'FAILED':
      return { type: 'danger' as const, text: '处理失败' }
    default:
      return { type: 'info' as const, text: '等待上传' }
  }
})

const previewUrl = computed(() => current.value?.sdUrl ?? current.value?.hdUrl ?? '')

function setCurrent(v: MachineVideo | null) {
  current.value = v
  emit('change', v)
  schedulePoll()
}

function schedulePoll() {
  clearTimeout(pollTimer)
  const id = current.value?.id
  if (!id || current.value?.status !== 'PROCESSING') return
  pollTimer = setTimeout(async () => {
    try {
      const v = await videoApi.get(id, true)
      if (current.value?.id !== id) return
      if (v.status === 'READY') ElMessage.success('视频压缩完成')
      if (v.status === 'FAILED') ElMessage.error(`视频处理失败：${v.error ?? '未知原因'}`)
      setCurrent(v)
    } catch {
      schedulePoll()
    }
  }, POLL_MS)
}

watch(
  () => props.video,
  (v) => {
    current.value = v
    schedulePoll()
  },
)
schedulePoll()
onBeforeUnmount(() => {
  clearTimeout(pollTimer)
  controller?.abort()
})

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function formatDuration(seconds: number | null) {
  if (!seconds) return '-'
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function pick() {
  inputRef.value?.click()
}

function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) void start(file)
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) void start(file)
}

async function start(file: File) {
  if (!file.type.startsWith('video/') && !VIDEO_EXT.test(file.name)) {
    ElMessage.error('请选择视频文件（MP4、MOV 等）')
    return
  }
  if (file.size > MAX_SIZE) {
    ElMessage.error(`视频不能超过 600 MB（当前 ${formatBytes(file.size)}）`)
    return
  }
  try {
    const video = await videoApi.create({ fileName: file.name, size: file.size, mime: file.type || undefined })
    await send(file, video)
  } catch {
    // Error toast comes from the http interceptor.
  }
}

async function send(file: File, video: MachineVideo) {
  uploading.value = true
  paused.value = null
  progress.value = 0
  speed.value = ''
  const abort = new AbortController()
  controller = abort
  const total = Math.ceil(file.size / video.chunkSize)
  const chunkLen = (i: number) => (i === total - 1 ? file.size - video.chunkSize * (total - 1) : video.chunkSize)
  try {
    const status = await videoApi.get(video.id, true)
    const done = new Set(status.received ?? [])
    let sent = [...done].reduce((sum, i) => sum + chunkLen(i), 0)
    let sentNow = 0
    const startedAt = Date.now()
    for (let i = 0; i < total; i++) {
      if (done.has(i)) continue
      const blob = file.slice(i * video.chunkSize, i * video.chunkSize + chunkLen(i))
      for (let attempt = 1; ; attempt++) {
        try {
          await videoApi.uploadChunk(video.id, i, blob, abort.signal, (loaded) => {
            progress.value = Math.min(99, Math.floor(((sent + loaded) / file.size) * 100))
            const seconds = (Date.now() - startedAt) / 1000
            if (seconds > 1) speed.value = `${formatBytes(Math.round((sentNow + loaded) / seconds))}/s`
          })
          break
        } catch (err) {
          if (abort.signal.aborted || attempt >= RETRIES) throw err
          await sleep(1500 * attempt)
        }
      }
      sent += blob.size
      sentNow += blob.size
    }
    const ready = await videoApi.complete(video.id)
    progress.value = 100
    videoId.value = ready.id
    setCurrent(ready)
    ElMessage.success('上传完成，服务器正在压缩视频；现在保存机型也可以，处理完成后发布即可上线')
  } catch {
    if (abort.signal.aborted) {
      ElMessage.info('已取消上传')
      void videoApi.remove(video.id, true).catch(() => undefined)
    } else {
      paused.value = { file, video }
      ElMessage.error('上传中断，可以点击“继续上传”从断点接着传')
    }
  } finally {
    uploading.value = false
    controller = null
  }
}

function resume() {
  if (paused.value) void send(paused.value.file, paused.value.video)
}

function discard() {
  if (paused.value) void videoApi.remove(paused.value.video.id, true).catch(() => undefined)
  paused.value = null
}

function cancel() {
  controller?.abort()
}

function detach() {
  videoId.value = null
  setCurrent(null)
  ElMessage.info('已移除视频，保存后生效')
}
</script>

<template>
  <div class="video-field">
    <input ref="inputRef" type="file" accept="video/*,.mp4,.mov,.m4v" hidden @change="onPick" />

    <div v-if="uploading" class="uploading">
      <el-progress :percentage="progress" :stroke-width="16" text-inside />
      <div class="hint">正在分片上传{{ speed ? `，${speed}` : '' }}。上传期间请不要关闭本页面。</div>
      <el-button size="small" @click="cancel">取消上传</el-button>
    </div>

    <template v-else>
      <el-alert v-if="paused" type="warning" :closable="false" show-icon class="paused" title="上传中断">
        <template #default>
          <div>已上传的部分不会重传，网络恢复后可继续。文件：{{ paused.file.name }}</div>
          <div class="actions">
            <el-button size="small" type="primary" @click="resume">继续上传</el-button>
            <el-button size="small" @click="discard">放弃</el-button>
          </div>
        </template>
      </el-alert>

      <div v-if="current" class="video-card">
        <div class="player">
          <video
            v-if="current.status === 'READY' && previewUrl"
            :src="previewUrl"
            :poster="current.posterUrl ?? undefined"
            controls
            playsinline
            preload="metadata"
          />
          <div v-else class="placeholder">
            <el-icon :size="36"><VideoCamera /></el-icon>
            <span v-if="current.status === 'PROCESSING'">服务器正在压缩视频，通常需要几分钟…</span>
            <span v-else-if="current.status === 'FAILED'">处理失败，请重新上传</span>
            <span v-else>等待上传完成</span>
          </div>
        </div>
        <div class="info">
          <div class="name">
            {{ current.originalName || '产品视频' }}
            <el-tag :type="statusTag.type" size="small">{{ statusTag.text }}</el-tag>
          </div>
          <p v-if="current.status === 'FAILED' && current.error" class="error">{{ current.error }}</p>
          <dl v-if="current.status === 'READY'">
            <dt>分辨率</dt>
            <dd>{{ current.width }} × {{ current.height }}</dd>
            <dt>时长</dt>
            <dd>{{ formatDuration(current.duration) }}</dd>
            <dt>原始大小</dt>
            <dd>{{ formatBytes(current.sourceSize) }}</dd>
            <dt>压缩后</dt>
            <dd>
              高清 {{ formatBytes(current.hdSize ?? 0) }}
              <template v-if="current.sdUrl !== current.hdUrl"> / 标清 {{ formatBytes(current.sdSize ?? 0) }}</template>
            </dd>
          </dl>
          <p class="hint">保存并发布后，视频显示在产品详情页“详细规格与技术参数”下方。访客点击播放才开始加载。</p>
          <div v-if="canEdit" class="actions">
            <el-button size="small" :icon="Refresh" @click="pick">替换视频</el-button>
            <el-button size="small" type="danger" plain :icon="Delete" @click="detach">移除</el-button>
          </div>
        </div>
      </div>

      <div
        v-else-if="canEdit && !paused"
        class="drop"
        :class="{ over: dragOver }"
        @click="pick"
        @dragover.prevent="dragOver = true"
        @dragleave.prevent="dragOver = false"
        @drop.prevent="onDrop"
      >
        <el-icon :size="40"><UploadFilled /></el-icon>
        <div>将视频拖到此处，或<em>点击选择</em></div>
        <div class="hint">支持手机录屏 MP4 / MOV，不超过 600 MB。上传后自动压缩为 1080P 高清和 720P 标清两个版本。</div>
      </div>

      <el-empty v-else-if="!paused" :image-size="60" description="暂无视频" />
    </template>
  </div>
</template>

<style scoped>
.uploading {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  max-width: 560px;
}

.uploading .el-progress {
  width: 100%;
}

.hint {
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.paused {
  margin-bottom: 12px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.actions .el-button + .el-button {
  margin-left: 0;
}

.video-card {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  align-items: flex-start;
}

.player {
  width: 280px;
  max-width: 100%;
  border-radius: 8px;
  overflow: hidden;
  background: #0f172a;
}

.player video {
  display: block;
  width: 100%;
  max-height: 420px;
  background: #000;
}

.placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 200px;
  padding: 16px;
  font-size: 13px;
  text-align: center;
  color: #cbd5e1;
}

.info {
  flex: 1;
  min-width: 240px;
}

.name {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  word-break: break-all;
}

.error {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--el-color-danger);
  word-break: break-all;
}

dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 16px;
  margin: 12px 0;
  font-size: 13px;
}

dt {
  color: var(--el-text-color-secondary);
}

dd {
  margin: 0;
}

.drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 28px 16px;
  border: 1px dashed var(--el-border-color);
  border-radius: 8px;
  color: var(--el-text-color-regular);
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.drop:hover,
.drop.over {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.drop em {
  font-style: normal;
  color: var(--el-color-primary);
}
</style>
