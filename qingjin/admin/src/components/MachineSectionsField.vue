<script setup lang="ts">
import { computed, ref } from 'vue'
import { Delete, Picture, Plus, Rank } from '@element-plus/icons-vue'
import { VueDraggable } from 'vue-draggable-plus'
import MediaPicker from '@/components/MediaPicker.vue'
import type { MachineSection, MediaItem, SectionItem, SectionKind } from '@/types/api'

/** One editable block. `uid` keys the drag lists; it is not sent to the server. */
export interface SectionRow extends Omit<MachineSection, 'items'> {
  uid: number
  items: (SectionItem & { uid: number })[]
}

const props = defineProps<{ canEdit: boolean }>()
const rows = defineModel<SectionRow[]>({ required: true })

const MAX_SECTIONS = 12
const MAX_ITEMS = 30

let seq = 0
const nextUid = () => ++seq

const presets: { label: string; kind: SectionKind; titleZh: string; titleEn: string }[] = [
  { label: '产品优势', kind: 'TEXT', titleZh: '产品优势', titleEn: 'Product Advantages' },
  { label: '产品特性', kind: 'TEXT', titleZh: '产品特性', titleEn: 'Product Features' },
  { label: '适用产品', kind: 'TEXT', titleZh: '适用产品', titleEn: 'Applications' },
  { label: '真空数量', kind: 'TEXT', titleZh: '真空数量', titleEn: 'Vacuum Capacity' },
  { label: '成品展示', kind: 'GALLERY', titleZh: '成品展示', titleEn: 'Product Display' },
  { label: '可选配置', kind: 'GALLERY', titleZh: '可选配置', titleEn: 'Optional Configuration' },
  { label: '可搭配其它设备使用', kind: 'GALLERY', titleZh: '可搭配其它设备使用', titleEn: 'Can be used in combination with other devices' },
  { label: '支持非标定制', kind: 'GALLERY', titleZh: '支持非标定制', titleEn: 'Support non-standard customization' },
  { label: '定制案例', kind: 'GALLERY', titleZh: '定制案例', titleEn: 'Custom Cases' },
  { label: '细节展示', kind: 'GALLERY', titleZh: '细节展示', titleEn: 'Detail Display' },
]

function addSection(kind: SectionKind, titleZh = '', titleEn = '') {
  if (rows.value.length >= MAX_SECTIONS) return
  const items = kind === 'TEXT' ? [{ uid: nextUid(), textZh: '', textEn: '' }] : []
  rows.value.push({ uid: nextUid(), kind, titleZh, titleEn, descZh: '', descEn: '', items })
}

function addPreset(label: string) {
  const p = presets.find((x) => x.label === label)
  if (p) addSection(p.kind, p.titleZh, p.titleEn)
}

function addLine(section: SectionRow) {
  if (section.items.length < MAX_ITEMS) section.items.push({ uid: nextUid(), textZh: '', textEn: '' })
}

function removeSection(index: number) {
  rows.value.splice(index, 1)
}

function removeItem(section: SectionRow, index: number) {
  section.items.splice(index, 1)
}

// ---- picture picking for gallery sections ----
const pickerOpen = ref(false)
const pickerTarget = ref<SectionRow | null>(null)

function openPicker(section: SectionRow) {
  pickerTarget.value = section
  pickerOpen.value = true
}

function onPicked(picked: MediaItem[]) {
  const section = pickerTarget.value
  if (!section) return
  for (const m of picked) {
    if (section.items.length >= MAX_ITEMS) break
    section.items.push({ uid: nextUid(), textZh: '', textEn: '', mediaId: m.id, url: m.url, width: m.width, height: m.height })
  }
}

const excludedFor = computed(() => pickerTarget.value?.items.map((i) => i.mediaId).filter((id): id is string => !!id) ?? [])
</script>

<template>
  <div class="sections-field">
    <div v-if="props.canEdit" class="page-toolbar">
      <el-dropdown trigger="click" :disabled="rows.length >= MAX_SECTIONS" @command="addPreset">
        <el-button :icon="Plus" :disabled="rows.length >= MAX_SECTIONS">添加板块</el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-for="p in presets" :key="p.label" :command="p.label">
              {{ p.label }}
              <span class="kind-tag">{{ p.kind === 'TEXT' ? '文字' : '图片' }}</span>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-button @click="addSection('TEXT')">自定义文字板块</el-button>
      <el-button @click="addSection('GALLERY')">自定义图片板块</el-button>
      <span class="tip">
        板块显示在详情页参数表下方，按这里的顺序排列，拖动左上角图标可调整。文字板块每行一条要点；图片板块从媒体库选图并可写图注。
      </span>
    </div>

    <VueDraggable v-model="rows" handle=".section-handle" :animation="150" :disabled="!props.canEdit" class="section-list">
      <div v-for="(section, si) in rows" :key="section.uid" class="section-card">
        <div class="section-head">
          <el-icon v-if="props.canEdit" class="section-handle" :size="18"><Rank /></el-icon>
          <el-tag size="small" :type="section.kind === 'TEXT' ? 'info' : 'success'">
            {{ section.kind === 'TEXT' ? '文字' : '图片' }}
          </el-tag>
          <el-input v-model="section.titleZh" size="small" maxlength="100" placeholder="中文标题，如 产品优势" class="title-input" />
          <el-input
            v-model="section.titleEn"
            size="small"
            maxlength="100"
            placeholder="英文标题，如 Product Advantages"
            class="title-input"
            :class="{ 'cell-missing': !section.titleEn.trim() }"
          />
          <el-button v-if="props.canEdit" link type="danger" :icon="Delete" aria-label="删除板块" @click="removeSection(si)">
            删除板块
          </el-button>
        </div>

        <el-row v-if="section.kind === 'GALLERY'" :gutter="12" class="desc-row">
          <el-col :xs="24" :md="12">
            <el-input v-model="section.descZh" type="textarea" :rows="2" maxlength="2000" placeholder="板块说明（中文，可不填）" />
          </el-col>
          <el-col :xs="24" :md="12">
            <el-input v-model="section.descEn" type="textarea" :rows="2" maxlength="2000" placeholder="板块说明（英文，可不填）" />
          </el-col>
        </el-row>

        <!-- 文字板块 -->
        <template v-if="section.kind === 'TEXT'">
          <VueDraggable v-model="section.items" handle=".line-handle" :animation="150" :disabled="!props.canEdit">
            <div v-for="(item, ii) in section.items" :key="item.uid" class="line-row">
              <el-icon v-if="props.canEdit" class="line-handle" :size="16"><Rank /></el-icon>
              <el-input v-model="item.textZh" type="textarea" :autosize="{ minRows: 1, maxRows: 6 }" maxlength="1000" placeholder="中文" />
              <el-input
                v-model="item.textEn"
                type="textarea"
                :autosize="{ minRows: 1, maxRows: 6 }"
                maxlength="1000"
                placeholder="英文"
                :class="{ 'cell-missing': item.textZh.trim() && !item.textEn.trim() }"
              />
              <el-button v-if="props.canEdit" link type="danger" :icon="Delete" aria-label="删除这一行" @click="removeItem(section, ii)" />
            </div>
          </VueDraggable>
          <el-button v-if="props.canEdit" size="small" :icon="Plus" :disabled="section.items.length >= MAX_ITEMS" @click="addLine(section)">
            添加一行
          </el-button>
        </template>

        <!-- 图片板块 -->
        <template v-else>
          <VueDraggable v-model="section.items" :animation="150" :disabled="!props.canEdit" class="pic-grid" handle=".pic-handle">
            <div v-for="(item, ii) in section.items" :key="item.uid" class="pic-tile">
              <div class="pic-box">
                <img :src="item.url ?? ''" alt="" loading="lazy" />
                <el-icon v-if="props.canEdit" class="pic-handle" :size="16"><Rank /></el-icon>
                <el-button
                  v-if="props.canEdit"
                  class="pic-remove"
                  circle
                  size="small"
                  type="danger"
                  :icon="Delete"
                  aria-label="移除图片"
                  @click="removeItem(section, ii)"
                />
              </div>
              <el-input v-model="item.textZh" size="small" maxlength="1000" placeholder="图注（中文，可不填）" />
              <el-input v-model="item.textEn" size="small" maxlength="1000" placeholder="图注（英文，可不填）" />
            </div>
          </VueDraggable>
          <el-button v-if="props.canEdit" size="small" :icon="Picture" :disabled="section.items.length >= MAX_ITEMS" @click="openPicker(section)">
            从媒体库选择图片
          </el-button>
          <span v-if="props.canEdit" class="tip inline">需要新图片时，先到「媒体库」上传。</span>
        </template>

        <el-empty v-if="!section.items.length" :image-size="40" description="还没有内容" />
      </div>
    </VueDraggable>

    <el-empty v-if="!rows.length" :image-size="60" description="暂无板块" />
    <MediaPicker v-model="pickerOpen" :exclude-ids="excludedFor" @select="onPicked" />
  </div>
</template>

<style scoped>
.section-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-card {
  padding: 12px 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
}

.section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.title-input {
  flex: 1 1 200px;
  min-width: 160px;
}

.section-handle,
.line-handle,
.pic-handle {
  cursor: grab;
  color: var(--el-text-color-secondary);
}

.desc-row {
  margin-bottom: 10px;
}

.line-row {
  display: grid;
  grid-template-columns: 20px 1fr 1fr 32px;
  gap: 8px;
  align-items: start;
  margin-bottom: 8px;
}

.pic-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  margin-bottom: 10px;
}

.pic-tile {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pic-box {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: #fff;
}

.pic-box img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pic-box .pic-handle {
  position: absolute;
  top: 4px;
  left: 4px;
  padding: 3px;
  border-radius: 4px;
  background: rgb(255 255 255 / 85%);
}

.pic-box .pic-remove {
  position: absolute;
  top: 4px;
  right: 4px;
}

.kind-tag {
  margin-left: 8px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.tip.inline {
  margin-left: 8px;
}

:deep(.cell-missing .el-input__wrapper),
:deep(.cell-missing .el-textarea__inner),
:deep(.cell-missing.el-input .el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--el-color-warning) inset;
}
</style>
