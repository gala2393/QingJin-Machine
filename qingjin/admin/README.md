# 青瑾机械 后台管理（qingjin-admin）

青瑾机械展示站的后台管理前端。技术栈：Vue 3 + Vite + TypeScript + Element Plus + Pinia + Vue Router + axios。

## 开发

```powershell
npm install
npm run dev
```

开发服务器默认运行在 <http://localhost:5174>。

Vite 会将以下路径代理到后端 API（`http://localhost:3000`，即 `../server` 的 NestJS 服务）：

| 前端请求路径 | 代理目标 |
| --- | --- |
| `/api/*` | `http://localhost:3000/api/*` |
| `/uploads/*` | `http://localhost:3000/uploads/*` |

如需修改后端地址，编辑 `vite.config.ts` 中的 `apiTarget`。

## 构建

```powershell
npm run typecheck   # vue-tsc 类型检查
npm run build       # 类型检查 + 生产构建，输出到 dist/
npm run preview     # 本地预览构建产物
```

生产构建的 `base` 为 `/admin/`，部署时需将 `dist/` 挂载到站点的 `/admin/` 路径下，并将 `/admin/*` 的未知路径回退到 `dist/index.html`（前端使用 history 路由）。

## 目录结构

- `src/api/`：axios 实例（自动携带 Token、401 时单次刷新并重试）与接口函数
- `src/stores/auth.ts`：登录状态（Token 持久化在 localStorage）
- `src/router/`：路由与全局守卫（未登录跳转登录页，按角色限制访问）
- `src/layouts/`：后台框架布局（侧边栏在窄屏下变为抽屉）
- `src/views/`：页面
- `src/types/api.ts`：接口类型定义
