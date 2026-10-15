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
  <div class="side">
    <RouterLink to="/dashboard" class="brand" @click="emit('navigate')">
      <div class="logo-box">
        <img :src="logoUrl" alt="青瑾机械" />
      </div>
      <div v-show="!collapse" class="brand-info">
        <span class="brand-title">青瑾机械</span>
        <span class="brand-subtitle">后台管理</span>
      </div>
    </RouterLink>

    <div class="menu-wrap">
      <el-menu
        :default-active="active"
        :collapse="collapse"
        :collapse-transition="false"
        router
        background-color="transparent"
        text-color="var(--qj-sidebar-text)"
        active-text-color="var(--qj-sidebar-active)"
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
  background: var(--qj-sidebar-bg);
  border-right: 1px solid var(--qj-sidebar-border);
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  height: var(--qj-header-height);
  padding: 0 16px;
  color: #fff;
  text-decoration: none;
  border-bottom: 1px solid var(--qj-sidebar-border);
  transition: background 0.15s ease;
}

.brand:hover {
  background: rgba(255, 255, 255, 0.03);
}

.logo-box {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.logo-box img {
  width: 22px;
  height: 22px;
  object-fit: contain;
}

.brand-info {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  white-space: nowrap;
}

.brand-title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: #ffffff;
}

.brand-subtitle {
  font-size: 11px;
  color: #64748b;
  letter-spacing: 0.05em;
  font-weight: 500;
}

.menu-wrap {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 10px 0;
}

.menu {
  border-right: none;
}

.menu :deep(.el-menu-item) {
  position: relative;
  margin: 2px 10px;
  padding-right: 12px;
  border-radius: 8px;
  height: 40px;
  line-height: 40px;
  color: #94a3b8;
  transition: background 0.2s ease, color 0.2s ease;
  font-weight: 500;
  font-size: 13.5px;
}

.menu :deep(.el-menu-item::before) {
  content: '';
  position: absolute;
  left: 0;
  top: 9px;
  bottom: 9px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: #f6c244;
  opacity: 0;
  transform: scaleY(0.4);
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.menu :deep(.el-menu-item:hover) {
  background: rgba(255, 255, 255, 0.05);
  color: #e2e8f0;
}

.menu :deep(.el-menu-item.is-active) {
  background: rgba(255, 255, 255, 0.1) !important;
  color: #ffffff !important;
  font-weight: 600;
}

.menu :deep(.el-menu-item.is-active::before) {
  opacity: 1;
  transform: scaleY(1);
}

.menu :deep(.el-menu-item.is-active .menu-icon) {
  color: #f6c244;
}

.menu-icon {
  position: relative;
  font-size: 17px;
  margin-right: 10px;
}

.menu-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.menu-badge {
  flex-shrink: 0;
  min-width: 20px;
  height: 18px;
  padding: 0 6px;
  margin-left: 8px;
  border-radius: 9px;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
}

.menu-badge.warn {
  background: #f6c244;
  color: #3b2a00;
}

.menu-badge.alert {
  background: rgba(242, 107, 58, 0.18);
  color: #ff9a6e;
  border: 1px solid rgba(242, 107, 58, 0.45);
  line-height: 16px;
}

.icon-dot {
  position: absolute;
  top: -2px;
  right: -3px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: 1.5px solid var(--qj-sidebar-bg);
}

.icon-dot.warn {
  background: #f6c244;
}

.icon-dot.alert {
  background: #f26b3a;
}

/* ---------- 底部：发布状态 + 访问官网 ---------- */
.side-footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid var(--qj-sidebar-border);
  background: rgba(0, 0, 0, 0.15);
}

.publish-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.publish-card.pending {
  background: rgba(246, 194, 68, 0.1);
  border-color: rgba(246, 194, 68, 0.35);
}

.publish-head {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
}

.ok-icon {
  color: #10b981;
  font-size: 14px;
}

.pending-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f6c244;
  box-shadow: 0 0 0 0 rgba(246, 194, 68, 0.7);
  animation: pulse 2s infinite;
  flex-shrink: 0;
}

@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(246, 194, 68, 0.7); }
  70% { box-shadow: 0 0 0 6px rgba(246, 194, 68, 0); }
  100% { box-shadow: 0 0 0 0 rgba(246, 194, 68, 0); }
}

.publish-title {
  flex: 1;
  color: #e2e8f0;
  font-weight: 600;
}

.version {
  color: #64748b;
  font-size: 11px;
  font-weight: 500;
}

.publish-btn {
  width: 100%;
  font-weight: 600;
  --el-button-bg-color: #f6c244;
  --el-button-border-color: #f6c244;
  --el-button-text-color: #3b2a00;
  --el-button-hover-bg-color: #f8cf63;
  --el-button-hover-border-color: #f8cf63;
  --el-button-hover-text-color: #3b2a00;
}

.site-link {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 7px 10px;
  border-radius: 8px;
  color: #94a3b8;
  font-size: 12px;
  text-decoration: none;
  transition: background 0.2s ease, color 0.2s ease;
}

.site-link:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #f8fafc;
}
</style>
