import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import type { Role } from '@/types/api'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    public?: boolean
    roles?: Role[]
    parent?: { title: string; path: string }
  }
}

const machinesParent = { title: '机型管理', path: '/machines' }
const machineEdit = () => import('@/views/MachineEditView.vue')


export const appRoutes: RouteRecordRaw[] = [
  { path: 'dashboard', name: 'dashboard', component: () => import('@/views/DashboardView.vue'), meta: { title: '仪表盘' } },
  { path: 'machines', name: 'machines', component: () => import('@/views/MachinesView.vue'), meta: { title: '机型管理' } },
  {
    path: 'machines/new',
    name: 'machine-new',
    component: machineEdit,
    meta: { title: '新增机型', parent: machinesParent, roles: ['SUPER_ADMIN', 'EDITOR'] },
  },
  { path: 'machines/:id', name: 'machine-edit', component: machineEdit, meta: { title: '编辑机型', parent: machinesParent } },
  { path: 'categories', name: 'categories', component: () => import('@/views/CategoriesView.vue'), meta: { title: '分类与参数模板' } },
  { path: 'media', name: 'media', component: () => import('@/views/MediaView.vue'), meta: { title: '媒体库' } },
  { path: 'settings', name: 'settings', component: () => import('@/views/SettingsView.vue'), meta: { title: '站点设置' } },
  { path: 'releases', name: 'releases', component: () => import('@/views/ReleasesView.vue'), meta: { title: '发布中心' } },
  { path: 'import-export', name: 'import-export', component: () => import('@/views/ImportExportView.vue'), meta: { title: '导入导出' } },
  { path: 'users', name: 'users', component: () => import('@/views/UsersView.vue'), meta: { title: '用户与角色', roles: ['SUPER_ADMIN'] } },
  { path: 'audit-logs', name: 'audit-logs', component: () => import('@/views/AuditLogsView.vue'), meta: { title: '操作日志', roles: ['SUPER_ADMIN'] } },
  { path: 'guide', name: 'guide', component: () => import('@/views/GuideView.vue'), meta: { title: '使用教程' } },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { title: '登录', public: true } },
    {
      path: '/',
      component: () => import('@/layouts/AdminLayout.vue'),
      redirect: '/dashboard',
      children: appRoutes,
    },
    { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (to.meta.public) {
    if (to.name === 'login' && auth.isLoggedIn && auth.user) return { path: '/dashboard' }
    return true
  }

  if (!auth.isLoggedIn) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (!auth.user) {
    try {
      await auth.fetchMe()
    } catch {
      return { name: 'login', query: { redirect: to.fullPath } }
    }
  }

  const roles = to.meta.roles
  if (roles?.length && !auth.hasRole(...roles)) {
    ElMessage.warning('当前账号无权访问该页面')
    return { path: '/dashboard' }
  }

  return true
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} - 青瑾机械 后台管理` : '青瑾机械 后台管理'
})

export default router
