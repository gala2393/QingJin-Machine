<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter, type RouteLocationNormalizedLoaded } from 'vue-router'
import { ArrowDown, Back, Close, CloseBold, Remove, Right } from '@element-plus/icons-vue'

interface Tab {
  path: string
  fullPath: string
  title: string
  fixed?: boolean
}

type CloseCommand = 'current' | 'left' | 'right' | 'other' | 'all'

const STORAGE_KEY = 'qingjin.workTabs'
const HOME: Tab = { path: '/dashboard', fullPath: '/dashboard', title: '仪表盘', fixed: true }
const MENU_WIDTH = 140

const route = useRoute()
const router = useRouter()

function load(): Tab[] {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]') as Tab[]
    return [HOME, ...saved.filter((t) => t.path !== HOME.path)]
  } catch {
    return [HOME]
  }
}

const tabs = ref<Tab[]>(load())
const scrollRef = ref<HTMLElement>()

function persist() {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tabs.value.filter((t) => !t.fixed)))
}

function track(r: RouteLocationNormalizedLoaded) {
  if (!r.meta.title || r.meta.public) return
  const existing = tabs.value.find((t) => t.path === r.path)
  if (existing) {
    existing.fullPath = r.fullPath
    existing.title = r.meta.title
  } else {
    tabs.value.push({ path: r.path, fullPath: r.fullPath, title: r.meta.title })
  }
  persist()
  nextTick(() => {
    scrollRef.value?.querySelector<HTMLElement>('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })
}

watch(() => route.fullPath, () => track(route), { immediate: true })

function open(tab: Tab) {
  if (tab.path !== route.path) router.push(tab.fullPath)
}

function close(tab: Tab) {
  if (tab.fixed) return
  const idx = tabs.value.indexOf(tab)
  tabs.value.splice(idx, 1)
  persist()
  if (tab.path === route.path) {
    const next = tabs.value[idx] ?? tabs.value[idx - 1] ?? HOME
    router.push(next.fullPath)
  }
}

/** Applies a close command relative to `targetPath` (the right-clicked tab, or the active one). */
function runCommand(cmd: CloseCommand, targetPath = route.path) {
  const target = tabs.value.find((t) => t.path === targetPath)
  const idx = target ? tabs.value.indexOf(target) : -1
  if (cmd === 'current') {
    if (target) close(target)
    return
  }
  tabs.value = tabs.value.filter((t, i) => {
    if (t.fixed) return true
    if (cmd === 'left') return i >= idx
    if (cmd === 'right') return i <= idx
    if (cmd === 'other') return i === idx
    return false
  })
  persist()
  if (!tabs.value.some((t) => t.path === route.path)) {
    router.push(target && tabs.value.includes(target) ? target.fullPath : HOME.fullPath)
  }
}

function onWheel(e: WheelEvent) {
  if (!scrollRef.value || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
  scrollRef.value.scrollLeft += e.deltaY
}

// ---------- Right-click menu ----------
const menu = ref<{ x: number; y: number; path: string } | null>(null)

function commandDisabled(cmd: CloseCommand, path: string) {
  const idx = tabs.value.findIndex((t) => t.path === path)
  const closable = (list: Tab[]) => list.some((t) => !t.fixed)
  if (cmd === 'current') return path === HOME.path
  if (cmd === 'left') return !closable(tabs.value.slice(0, idx))
  if (cmd === 'right') return !closable(tabs.value.slice(idx + 1))
  if (cmd === 'other') return !closable(tabs.value.filter((t) => t.path !== path))
  return !closable(tabs.value)
}

const menuItems: { cmd: CloseCommand; label: string; icon: typeof Close; divided?: boolean }[] = [
  { cmd: 'current', label: '关闭当前', icon: Close },
  { cmd: 'left', label: '关闭左侧', icon: Back, divided: true },
  { cmd: 'right', label: '关闭右侧', icon: Right },
  { cmd: 'other', label: '关闭其他', icon: Remove },
  { cmd: 'all', label: '关闭全部', icon: CloseBold },
]

function hideMenu() {
  menu.value = null
}

function showMenu(e: MouseEvent, tab: Tab) {
  const x = Math.min(e.clientX, window.innerWidth - MENU_WIDTH - 8)
  menu.value = { x, y: e.clientY + 4, path: tab.path }
}

function pick(cmd: CloseCommand) {
  const path = menu.value?.path
  hideMenu()
  if (path && !commandDisabled(cmd, path)) runCommand(cmd, path)
}

watch(menu, (m) => {
  if (m) {
    window.addEventListener('mousedown', hideMenu)
    window.addEventListener('blur', hideMenu)
    window.addEventListener('resize', hideMenu)
  } else {
    window.removeEventListener('mousedown', hideMenu)
    window.removeEventListener('blur', hideMenu)
    window.removeEventListener('resize', hideMenu)
  }
})
onBeforeUnmount(hideMenu)
</script>

<template>
  <div class="work-tabs">
    <div ref="scrollRef" class="tabs-scroll" @wheel.prevent="onWheel" @scroll="hideMenu">
      <TransitionGroup tag="ul" name="tab" class="tabs">
        <li
          v-for="tab in tabs"
          :key="tab.path"
          class="tab"
          :class="{ active: tab.path === route.path, fixed: tab.fixed }"
          @click="open(tab)"
          @click.middle.prevent="close(tab)"
          @contextmenu.prevent="showMenu($event, tab)"
        >
          <span class="tab-title">{{ tab.title }}</span>
          <span v-if="!tab.fixed" class="tab-close" @click.stop="close(tab)">
            <el-icon :size="10"><Close /></el-icon>
          </span>
        </li>
      </TransitionGroup>
    </div>

    <el-dropdown trigger="click" placement="bottom-end" @command="(c: CloseCommand) => runCommand(c)">
      <div class="tabs-more" aria-label="标签页操作">
        <el-icon :size="14"><ArrowDown /></el-icon>
      </div>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item
            v-for="item in menuItems"
            :key="item.cmd"
            :command="item.cmd"
            :icon="item.icon"
            :divided="item.divided"
            :disabled="commandDisabled(item.cmd, route.path)"
          >
            {{ item.label }}
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

    <Teleport to="body">
      <Transition name="context-menu">
        <ul v-if="menu" class="tab-context-menu" :style="{ left: `${menu.x}px`, top: `${menu.y}px` }" @mousedown.stop>
          <li
            v-for="item in menuItems"
            :key="item.cmd"
            class="ctx-item"
            :class="{ disabled: commandDisabled(item.cmd, menu.path), divided: item.divided }"
            @click="pick(item.cmd)"
          >
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ item.label }}</span>
          </li>
        </ul>
      </Transition>
    </Teleport>
  </div>
</template>
<style scoped>
.work-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 20px;
  margin-bottom: 12px;
  user-select: none;
}

.tabs-scroll {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.tabs-scroll::-webkit-scrollbar {
  display: none;
}

.tabs {
  display: flex;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
  white-space: nowrap;
}

.tab {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 8px 0 12px;
  font-size: 12px;
  color: var(--art-gray-600);
  background: var(--default-box-color);
  border: 1px solid var(--art-card-border);
  border-radius: calc(var(--custom-radius) / 2.5 + 2px);
  cursor: pointer;
  transition: color 0.2s;
}

.tab.fixed {
  padding: 0 12px;
}

.tab:hover,
.tab.active {
  color: var(--theme-color);
}

.tab-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 4px;
  padding: 4px;
  border-radius: 50%;
  color: var(--art-gray-600);
  transition: background 0.2s;
}

.tab-close:hover {
  background: var(--art-gray-200);
}

.tabs-more {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  color: var(--art-gray-700);
  background: var(--default-box-color);
  border: 1px solid var(--art-card-border);
  border-radius: calc(var(--custom-radius) / 2.5);
  cursor: pointer;
  transition: background 0.2s;
}

.tabs-more:hover {
  background: var(--art-hover-color);
}

.tab-enter-active {
  transition:
    opacity 0.25s ease-out,
    transform 0.25s ease-out;
}

.tab-leave-active {
  transition:
    opacity 0.15s ease-in,
    transform 0.15s ease-in;
}

.tab-enter-from,
.tab-leave-to {
  opacity: 0;
  transform: scale(0.9);
}

.tab-move {
  transition: transform 0.25s ease;
}

.tab-context-menu {
  position: fixed;
  z-index: 3000;
  width: 140px;
  margin: 0;
  padding: 5px;
  list-style: none;
  background: var(--default-box-color);
  border: 1px solid var(--art-card-border);
  border-radius: 10px;
  box-shadow: var(--qj-shadow-float);
  transform-origin: top left;
}

.ctx-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 10px;
  font-size: 13px;
  color: var(--art-gray-800);
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
}

.ctx-item .el-icon {
  font-size: 14px;
  color: var(--art-gray-600);
}

.ctx-item:not(.disabled):hover {
  background: var(--art-gray-200);
}

.ctx-item.divided {
  margin-top: 9px;
}

.ctx-item.divided::before {
  position: absolute;
  top: -5px;
  right: 0;
  left: 0;
  height: 1px;
  content: '';
  background: var(--art-gray-300);
}

.ctx-item.disabled {
  color: var(--el-text-color-disabled);
  cursor: not-allowed;
}

.ctx-item.disabled .el-icon {
  color: var(--el-text-color-disabled);
}

.context-menu-enter-active,
.context-menu-leave-active {
  transition: all 0.1s ease-out;
}

.context-menu-enter-from,
.context-menu-leave-to {
  opacity: 0;
  transform: scale(0.9);
}

@media (max-width: 640px) {
  .work-tabs {
    padding: 0 15px;
  }
}
</style>
