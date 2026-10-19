<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Box,
  CircleCheckFilled,
  Grid,
  Odometer,
  Picture,
  Promotion,
  Reading,
  Setting,
  Switch,
  Tickets,
  TopRight,
  UserFilled,
} from '@element-plus/icons-vue'
import { useCanEdit } from '@/composables/useCanEdit'
import { refreshNavStatus, useNavStatus } from '@/composables/useNavStatus'
import { usePublicInfo } from '@/composables/usePublicInfo'
import { useAuthStore } from '@/stores/auth'
import type { Role } from '@/types/api'

defineProps<{ collapse?: boolean }>()
const emit = defineEmits<{ navigate: [] }>()

const POLL_MS = 60_000

interface MenuItem {
  path: string
  label: string
  icon: Component
  roles?: Role[]
}

interface Badge {
  text: string
  tone: 'warn' | 'alert'
  title: string
}

const items: MenuItem[] = [
  { path: '/dashboard', label: '仪表盘', icon: Odometer },
  { path: '/machines', label: '机型管理', icon: Box },
  { path: '/categories', label: '分类与参数模板', icon: Grid },
  { path: '/media', label: '媒体库', icon: Picture },
  { path: '/settings', label: '站点设置', icon: Setting },
  { path: '/releases', label: '发布中心', icon: Promotion },
  { path: '/import-export', label: '导入导出', icon: Switch },
  { path: '/users', label: '用户与角色', icon: UserFilled, roles: ['SUPER_ADMIN'] },
  { path: '/audit-logs', label: '操作日志', icon: Tickets, roles: ['SUPER_ADMIN'] },
  { path: '/guide', label: '使用教程', icon: Reading },
]

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const canEdit = useCanEdit()
const publicInfo = usePublicInfo()
const status = useNavStatus()

const visibleItems = computed(() => items.filter((i) => !i.roles || auth.hasRole(...i.roles)))
const active = computed(() => '/' + (route.path.split('/')[1] ?? ''))
const logoUrl = `${import.meta.env.BASE_URL}logo.png`

const unlisted = computed(() => (status.value ? status.value.machines.draft + status.value.machines.hidden : 0))
const hasPending = computed(() => !!status.value?.pendingChanges)
const liveVersion = computed(() => status.value?.liveVersion ?? null)

const badges = computed<Record<string, Badge | undefined>>(() => ({
  '/machines': unlisted.value
    ? { text: String(unlisted.value), tone: 'warn', title: `${unlisted.value} 个机型未上架（草稿或已下架）` }
    : undefined,
  '/releases': hasPending.value ? { text: '待发布', tone: 'alert', title: '有修改尚未发布到官网' } : undefined,
}))

watch(() => route.path, () => refreshNavStatus())
let timer: number | undefined
const onFocus = () => refreshNavStatus()
onMounted(() => {
  refreshNavStatus(true)
  timer = window.setInterval(() => refreshNavStatus(), POLL_MS)
  window.addEventListener('focus', onFocus)
})
onBeforeUnmount(() => {
  window.clearInterval(timer)
  window.removeEventListener('focus', onFocus)
})

function goPublish() {
  router.push('/releases')
  emit('navigate')
}
</script>

<template>
  <div class="side" :class="{ collapsed: collapse }">
    <RouterLink to="/dashboard" class="brand" @click="emit('navigate')">
      <img :src="logoUrl" alt="青瑾机械" class="logo" />
      <span v-show="!collapse" class="brand-title">青瑾机械后台</span>
    </RouterLink>

    <div class="menu-wrap">
      <el-menu
        :default-active="active"
        :collapse="collapse"
        :collapse-transition="false"
        router
        class="menu"
        @select="emit('navigate')"
      >
        <el-menu-item v-for="item in visibleItems" :key="item.path" :index="item.path">
          <el-icon class="menu-icon">
            <component :is="item.icon" />
            <i v-if="collapse && badges[item.path]" class="icon-dot" :class="badges[item.path]!.tone"></i>
          </el-icon>
          <template #title>
            <span class="menu-label">{{ item.label }}</span>
            <span
              v-if="badges[item.path]"
              class="menu-badge"
              :class="badges[item.path]!.tone"
              :title="badges[item.path]!.title"
            >
              {{ badges[item.path]!.text }}
            </span>
          </template>
        </el-menu-item>
      </el-menu>
    </div>

    <div v-if="!collapse" class="side-footer">
      <div class="publish-card" :class="{ pending: hasPending }">
        <div class="publish-head">
          <el-icon v-if="!hasPending" class="ok-icon"><CircleCheckFilled /></el-icon>
          <span v-else class="pending-dot"></span>
          <span class="publish-title">{{ hasPending ? '有修改待发布' : '官网已是最新' }}</span>
          <span v-if="liveVersion != null" class="version">线上 v{{ liveVersion }}</span>
        </div>
        <el-button
          v-if="hasPending && canEdit"
          type="warning"
          size="small"
          :icon="Promotion"
          class="publish-btn"
          @click="goPublish"
        >
          发布到官网
        </el-button>
      </div>
      <a
        v-if="publicInfo?.siteUrl"
        :href="publicInfo.siteUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="site-link"
        title="在新标签页中打开官网"
      >
        <span>访问官网</span>
        <el-icon :size="12"><TopRight /></el-icon>
      </a>
    </div>
  </div>
</template>

<style scoped>
.side {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--default-box-color);
  border-right: 1px solid var(--art-card-border);
  user-select: none;
}

.brand {
  display: flex;
  align-items: center;
  height: var(--qj-header-height);
  flex-shrink: 0;
  padding-left: 22px;
  overflow: hidden;
  white-space: nowrap;
  text-decoration: none;
}

.side.collapsed .brand {
  justify-content: center;
  padding-left: 0;
}

.logo {
  width: 30px;
  height: 30px;
  object-fit: contain;
  flex-shrink: 0;
}

.brand-title {
  margin-left: 10px;
  font-size: 18px;
  color: var(--art-gray-800);
}

.menu-wrap {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  scrollbar-width: none;
}

.menu-wrap::-webkit-scrollbar {
  width: 0;
}

.menu {
  --el-menu-bg-color: transparent;
  --el-menu-hover-bg-color: var(--art-gray-200);
  --el-menu-text-color: #29343d;
  --el-menu-active-color: var(--theme-color);
  border-right: none;
}

.menu :deep(.el-menu-item) {
  position: relative;
  width: calc(100% - 16px);
  height: 42px;
  line-height: 42px;
  margin: 0 0 4px 8px;
  padding-right: 12px;
  border-radius: 6px;
  transition: background-color 0s;
}

.menu:not(.el-menu--collapse) :deep(.el-menu-item) {
  padding-left: 18px !important;
}

.menu :deep(.el-menu-item:not(.is-active):hover) {
  background: var(--art-gray-200);
}

.menu :deep(.el-menu-item.is-active) {
  color: var(--theme-color);
  background-color: var(--el-color-primary-light-9);
}

.menu-icon {
  position: relative;
  margin-right: 8px;
  font-size: 20px;
  color: #6b6b6b;
}

.menu :deep(.el-menu-item.is-active .menu-icon) {
  color: var(--theme-color);
}

.menu.el-menu--collapse :deep(.el-menu-item .menu-icon) {
  margin-right: 0;
}

.menu-label {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.menu-badge {
  flex-shrink: 0;
  min-width: 20px;
  height: 18px;
  padding: 0 5px;
  margin-left: 8px;
  border-radius: 4px;
  font-size: 10px;
  line-height: 18px;
  text-align: center;
  color: #fff;
}

.menu-badge.warn {
  background: var(--el-color-warning);
}

.menu-badge.alert {
  background: #fd4e4e;
}

.icon-dot {
  position: absolute;
  top: -2px;
  right: -3px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  animation: breathe 1.5s ease-in-out infinite;
}

.icon-dot.warn {
  background: var(--el-color-warning);
}

.icon-dot.alert {
  background: #ff3860;
}

@keyframes breathe {
  0%,
  100% {
    opacity: 0.7;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.1);
  }
}

/* ---------- Footer: publish status + site link ---------- */
.side-footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}

.publish-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: calc(var(--custom-radius) / 2 + 2px);
  background: var(--art-gray-100);
  border: 1px solid var(--art-card-border);
}

.publish-card.pending {
  background: var(--el-color-warning-light-9);
  border-color: var(--el-color-warning-light-7);
}

.publish-head {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
}

.ok-icon {
  color: var(--el-color-success);
  font-size: 14px;
}

.pending-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--el-color-warning);
  animation: pulse 2s infinite;
  flex-shrink: 0;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(255, 174, 31, 0.7);
  }
  70% {
    box-shadow: 0 0 0 6px rgba(255, 174, 31, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(255, 174, 31, 0);
  }
}

.publish-title {
  flex: 1;
  color: var(--art-gray-800);
  font-weight: 500;
}

.version {
  color: var(--art-gray-500);
  font-size: 11px;
}

.publish-btn {
  width: 100%;
}

.site-link {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 7px 10px;
  border-radius: 6px;
  color: var(--art-gray-600);
  font-size: 12px;
  text-decoration: none;
  transition: background 0.2s ease, color 0.2s ease;
}

.site-link:hover {
  background: var(--art-gray-200);
  color: var(--theme-color);
}
</style>