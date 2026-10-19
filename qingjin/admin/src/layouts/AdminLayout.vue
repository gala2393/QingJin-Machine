<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import {
  ArrowUp,
  Expand,
  Fold,
  FullScreen,
  Key,
  Menu as MenuIcon,
  Monitor,
  Reading,
  RefreshRight,
  TopRight,
} from '@element-plus/icons-vue'
import SideMenu from './SideMenu.vue'
import WorkTabs from './WorkTabs.vue'
import ChangePasswordDialog from '@/components/ChangePasswordDialog.vue'
import { usePublicInfo } from '@/composables/usePublicInfo'
import { useAuthStore } from '@/stores/auth'
import { ROLE_LABELS } from '@/types/api'

const MOBILE_QUERY = '(max-width: 768px)'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const publicInfo = usePublicInfo()

const collapsed = ref(localStorage.getItem('qingjin.sidebarCollapsed') === '1')
const drawerOpen = ref(false)
const mql = window.matchMedia(MOBILE_QUERY)
const isMobile = ref(mql.matches)
const isFullscreen = ref(!!document.fullscreenElement)

const syncMobile = () => {
  isMobile.value = mql.matches
  if (!isMobile.value) drawerOpen.value = false
}
const syncFullscreen = () => {
  isFullscreen.value = !!document.fullscreenElement
}

onMounted(() => {
  mql.addEventListener('change', syncMobile)
  document.addEventListener('fullscreenchange', syncFullscreen)
})
onBeforeUnmount(() => {
  mql.removeEventListener('change', syncMobile)
  document.removeEventListener('fullscreenchange', syncFullscreen)
})

function toggleSidebar() {
  if (isMobile.value) {
    drawerOpen.value = !drawerOpen.value
  } else {
    collapsed.value = !collapsed.value
    localStorage.setItem('qingjin.sidebarCollapsed', collapsed.value ? '1' : '0')
  }
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen()
  else document.documentElement.requestFullscreen?.()
}

const viewAlive = ref(true)
function reload() {
  viewAlive.value = false
  nextTick(() => (viewAlive.value = true))
}

const BACK_TOP_THRESHOLD = 300
const contentRef = ref<HTMLElement>()
const showBackTop = ref(false)
function onContentScroll() {
  showBackTop.value = (contentRef.value?.scrollTop ?? 0) > BACK_TOP_THRESHOLD
}
function backToTop() {
  contentRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
}
watch(
  () => route.path,
  () => {
    contentRef.value?.scrollTo({ top: 0 })
    showBackTop.value = false
  },
)

const crumbs = computed(() => {
  const list: { title: string; path?: string }[] = [{ title: '仪表盘', path: '/dashboard' }]
  if (route.name === 'dashboard') return list
  if (route.meta.parent) list.push({ title: route.meta.parent.title, path: route.meta.parent.path })
  list.push({ title: route.meta.title ?? '' })
  return list
})

const roleLabel = computed(() => (auth.user ? ROLE_LABELS[auth.user.role] : ''))
const initial = computed(() => auth.user?.displayName?.slice(0, 1) ?? '')

const passwordOpen = ref(false)
const userMenuOpen = ref(false)

function openPassword() {
  userMenuOpen.value = false
  passwordOpen.value = true
}

function goGuide() {
  userMenuOpen.value = false
  router.push('/guide')
}

async function logout() {
  userMenuOpen.value = false
  try {
    await ElMessageBox.confirm('确定要退出登录吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  sessionStorage.removeItem('qingjin.workTabs')
  await auth.logout()
  router.replace({ name: 'login' })
}
</script>

<template>
  <div class="layout">
    <aside v-if="!isMobile" class="aside" :class="{ collapsed }">
      <SideMenu :collapse="collapsed" />
    </aside>

    <el-drawer
      v-else
      v-model="drawerOpen"
      direction="ltr"
      size="240px"
      :with-header="false"
      class="side-drawer"
    >
      <SideMenu @navigate="drawerOpen = false" />
    </el-drawer>

    <div class="main">
      <header class="header">
        <div class="header-left">
          <button type="button" class="icon-btn" aria-label="切换菜单" @click="toggleSidebar">
            <el-icon>
              <MenuIcon v-if="isMobile" />
              <Expand v-else-if="collapsed" />
              <Fold v-else />
            </el-icon>
          </button>
          <button type="button" class="icon-btn hide-sm anim-rotate" aria-label="刷新页面" @click="reload">
            <el-icon><RefreshRight /></el-icon>
          </button>

          <nav class="crumb" aria-label="breadcrumb">
            <template v-for="(c, i) in crumbs" :key="i">
              <span v-if="i > 0" class="crumb-sep">/</span>
              <RouterLink v-if="c.path && i < crumbs.length - 1" :to="c.path" class="crumb-item link">
                {{ c.title }}
              </RouterLink>
              <span v-else class="crumb-item">{{ c.title }}</span>
            </template>
          </nav>
        </div>

        <div class="header-right">
          <el-tooltip v-if="publicInfo?.siteUrl" content="查看前台" placement="bottom">
            <a :href="publicInfo.siteUrl" target="_blank" rel="noopener noreferrer" class="icon-btn anim-move-up" aria-label="查看前台">
              <el-icon><Monitor /></el-icon>
            </a>
          </el-tooltip>
          <el-tooltip :content="isFullscreen ? '退出全屏' : '全屏'" placement="bottom">
            <button
              type="button"
              class="icon-btn hide-md"
              :class="isFullscreen ? 'anim-shrink' : 'anim-expand'"
              aria-label="全屏"
              @click="toggleFullscreen"
            >
              <el-icon><FullScreen /></el-icon>
            </button>
          </el-tooltip>

          <el-popover
            v-model:visible="userMenuOpen"
            placement="bottom-end"
            :width="240"
            :offset="10"
            trigger="click"
            :show-arrow="false"
            popper-class="user-menu-popover"
          >
            <template #reference>
              <span class="avatar" role="button" tabindex="0">{{ initial }}</span>
            </template>
            <div class="user-card">
              <div class="user-head">
                <span class="avatar lg">{{ initial }}</span>
                <div class="user-meta">
                  <span class="user-name">{{ auth.user?.displayName }}</span>
                  <span class="user-sub">@{{ auth.user?.username }}<template v-if="roleLabel"> · {{ roleLabel }}</template></span>
                </div>
              </div>
              <ul class="user-actions">
                <li class="action" @click="openPassword">
                  <el-icon><Key /></el-icon>
                  <span>修改密码</span>
                </li>
                <li class="action" @click="goGuide">
                  <el-icon><Reading /></el-icon>
                  <span>使用教程</span>
                </li>
                <li v-if="publicInfo?.siteUrl" class="action">
                  <a :href="publicInfo.siteUrl" target="_blank" rel="noopener noreferrer" @click="userMenuOpen = false">
                    <el-icon><TopRight /></el-icon>
                    <span>访问官网</span>
                  </a>
                </li>
              </ul>
              <div class="logout" role="button" @click="logout">退出登录</div>
            </div>
          </el-popover>
        </div>
      </header>

      <WorkTabs />

      <main ref="contentRef" class="content" @scroll.passive="onContentScroll">
        <RouterView v-if="viewAlive" v-slot="{ Component, route: r }">
          <Transition name="slide-left" mode="out-in" appear>
            <component :is="Component" :key="r.path" />
          </Transition>
        </RouterView>
      </main>

      <Transition name="back-top">
        <button v-show="showBackTop" type="button" class="back-top" aria-label="返回顶部" @click="backToTop">
          <el-icon><ArrowUp /></el-icon>
        </button>
      </Transition>
    </div>

    <ChangePasswordDialog v-model="passwordOpen" />
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  height: 100%;
  background: var(--default-bg-color);
}

.aside {
  width: var(--qj-sidebar-width);
  flex-shrink: 0;
  transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 30;
}

.aside.collapsed {
  width: var(--qj-sidebar-collapsed-width);
}

.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.header {
  height: var(--qj-header-height);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 20px 0 12px;
  background: var(--default-bg-color);
  user-select: none;
}

.header-left {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  font-size: 20px;
  color: var(--art-gray-600);
  background: transparent;
  cursor: pointer;
  text-decoration: none;
  transition: all 0.3s;
}

.icon-btn:hover {
  background: var(--art-hover-color);
}

.anim-rotate:hover .el-icon {
  animation: qj-rotate180 0.5s;
}

.anim-expand:hover .el-icon {
  animation: qj-expand 0.6s forwards;
}

.anim-shrink:hover .el-icon {
  animation: qj-shrink 0.6s forwards;
}

.anim-move-up:hover .el-icon {
  animation: qj-move-up 0.4s;
}

.back-top {
  position: fixed;
  right: 40px;
  bottom: 60px;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  padding: 0;
  font-size: 18px;
  color: var(--art-gray-500);
  background: var(--default-box-color);
  border: 1px solid var(--art-gray-300);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s;
}

.back-top:hover {
  background: var(--art-gray-200);
}

.back-top-enter-active {
  transition: all 0.3s ease-out;
}

.back-top-leave-active {
  transition: all 0.2s ease-in;
}

.back-top-enter-from,
.back-top-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.crumb {
  display: flex;
  align-items: center;
  min-width: 0;
  margin-left: 8px;
  overflow: hidden;
  white-space: nowrap;
  font-size: 14px;
}

.crumb-item {
  max-width: 184px;
  padding: 4px 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--art-gray-600);
  border-radius: 4px;
  text-decoration: none;
}

.crumb-item.link {
  transition: background 0.2s;
}

.crumb-item.link:hover {
  background: var(--art-active-color);
}

.crumb-sep {
  margin: 0 4px;
  color: var(--art-gray-500);
}

.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--el-color-primary);
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  outline: none;
}

.avatar.lg {
  width: 40px;
  height: 40px;
  font-size: 16px;
  cursor: default;
}

.user-card {
  padding-top: 8px;
}

.user-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 4px;
}

.user-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.user-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--art-gray-800);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--art-gray-500);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-actions {
  list-style: none;
  margin: 12px 0 0;
  padding: 12px 0 8px;
  border-top: 1px solid var(--art-gray-300);
}

.action {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  margin-bottom: 6px;
  border-radius: 6px;
  font-size: 14px;
  color: var(--art-gray-800);
  cursor: pointer;
}

.action:last-child {
  margin-bottom: 0;
}

.action a {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  color: inherit;
  text-decoration: none;
}

.action:hover {
  background: var(--art-gray-200);
}

.action .el-icon {
  font-size: 16px;
}

.logout {
  margin: 8px 0 6px;
  padding: 6px 0;
  font-size: 12px;
  text-align: center;
  color: var(--art-gray-800);
  border: 1px solid var(--art-gray-400);
  border-radius: 6px;
  cursor: pointer;
  transition: box-shadow 0.2s;
}

.logout:hover {
  box-shadow: var(--qj-shadow-float);
}

.content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 20px 20px;
}

@media (max-width: 1024px) {
  .crumb {
    display: none;
  }
}

@media (max-width: 768px) {
  .hide-md {
    display: none;
  }
}

@media (max-width: 640px) {
  .header {
    padding: 0 12px 0 6px;
  }

  .hide-sm {
    display: none;
  }

  .content {
    padding: 0 15px 15px;
  }

  .back-top {
    right: 16px;
    bottom: 24px;
  }
}
</style>

<style>
.side-drawer .el-drawer__body {
  padding: 0;
}

.user-menu-popover.el-popover.el-popper {
  padding: 5px 16px;
  border: none;
  box-shadow: var(--qj-shadow-float);
}
</style>
