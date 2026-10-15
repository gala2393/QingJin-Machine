<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowDown, Expand, Fold, Menu as MenuIcon, TopRight } from '@element-plus/icons-vue'
import SideMenu from './SideMenu.vue'
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

const syncMobile = () => {
  isMobile.value = mql.matches
  if (!isMobile.value) drawerOpen.value = false
}

onMounted(() => mql.addEventListener('change', syncMobile))
onBeforeUnmount(() => mql.removeEventListener('change', syncMobile))

function toggleSidebar() {
  if (isMobile.value) {
    drawerOpen.value = !drawerOpen.value
  } else {
    collapsed.value = !collapsed.value
    localStorage.setItem('qingjin.sidebarCollapsed', collapsed.value ? '1' : '0')
  }
}

const title = computed(() => route.meta.title ?? '')
const roleLabel = computed(() => (auth.user ? ROLE_LABELS[auth.user.role] : ''))

const passwordOpen = ref(false)

async function onCommand(command: string) {
  if (command === 'password') {
    passwordOpen.value = true
  } else if (command === 'logout') {
    await auth.logout()
    router.replace({ name: 'login' })
  }
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
        <el-button text class="toggle" aria-label="切换菜单" @click="toggleSidebar">
          <el-icon :size="18">
            <MenuIcon v-if="isMobile" />
            <Expand v-else-if="collapsed" />
            <Fold v-else />
          </el-icon>
        </el-button>

        <el-breadcrumb separator="/" class="crumb">
          <el-breadcrumb-item :to="{ path: '/dashboard' }">首页</el-breadcrumb-item>
          <el-breadcrumb-item v-if="route.meta.parent" :to="{ path: route.meta.parent.path }">
            {{ route.meta.parent.title }}
          </el-breadcrumb-item>
          <el-breadcrumb-item v-if="route.name !== 'dashboard'">{{ title }}</el-breadcrumb-item>
        </el-breadcrumb>

        <div class="header-right">
          <a
            v-if="publicInfo?.siteUrl"
            :href="publicInfo.siteUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="site-btn"
            title="新窗口打开展示站"
          >
            <span>查看前台</span>
            <el-icon :size="13"><TopRight /></el-icon>
          </a>

          <el-dropdown trigger="click" @command="onCommand">
            <span class="user">
              <el-avatar :size="28" class="user-avatar">{{ auth.user?.displayName?.slice(0, 1) }}</el-avatar>
              <span class="user-name">{{ auth.user?.displayName }}</span>
              <el-tag v-if="roleLabel" size="small" effect="plain" class="user-role">{{ roleLabel }}</el-tag>
              <el-icon class="arrow-icon"><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu class="user-menu">
                <el-dropdown-item disabled class="user-info-item">
                  <div class="menu-user-details">
                    <span class="menu-user-name">{{ auth.user?.displayName }}</span>
                    <span class="menu-user-sub">@{{ auth.user?.username }} · {{ roleLabel }}</span>
                  </div>
                </el-dropdown-item>
                <el-dropdown-item command="password" divided>修改密码</el-dropdown-item>
                <el-dropdown-item command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <main class="content">
        <h1 class="page-title">{{ title }}</h1>
        <RouterView />
      </main>
    </div>

    <ChangePasswordDialog v-model="passwordOpen" />
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  height: 100%;
  background: var(--qj-page-bg);
}

.aside {
  width: 220px;
  flex-shrink: 0;
  transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 30;
}

.aside.collapsed {
  width: 64px;
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
  gap: 12px;
  padding: 0 20px 0 12px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--el-border-color);
  position: sticky;
  top: 0;
  z-index: 20;
}

.toggle {
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 8px;
  color: var(--el-text-color-regular);
}

.toggle:hover {
  background: var(--el-fill-color-light);
  color: var(--el-color-primary);
}

.crumb {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  font-size: 13.5px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.site-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 11px;
  border-radius: 20px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color);
  text-decoration: none;
  transition: all 0.2s ease;
}

.site-btn:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary-light-5);
  background: var(--el-color-primary-light-9);
}

.user {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px 4px 4px;
  border-radius: 20px;
  border: 1px solid var(--el-border-color);
  background: #ffffff;
  cursor: pointer;
  outline: none;
  transition: all 0.2s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
}

.user:hover {
  border-color: #cbd5e1;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.user-avatar {
  background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  color: #ffffff;
  font-weight: 600;
  font-size: 13px;
}

.user-name {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.user-role {
  font-size: 11px;
  height: 20px;
  line-height: 18px;
  padding: 0 6px;
}

.arrow-icon {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  transition: transform 0.2s ease;
}

.menu-user-details {
  display: flex;
  flex-direction: column;
  padding: 4px 0;
}

.menu-user-name {
  font-weight: 600;
  color: var(--el-text-color-primary);
  font-size: 14px;
}

.menu-user-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.content {
  flex: 1;
  overflow: auto;
  padding: 24px;
}

.page-title {
  margin: 0 0 20px;
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.02em;
}

@media (max-width: 768px) {
  .content {
    padding: 14px;
  }

  .site-btn {
    display: none;
  }

  .user-name,
  .user-role {
    display: none;
  }
}
</style>

<style>
.side-drawer .el-drawer__body {
  padding: 0;
}
</style>
