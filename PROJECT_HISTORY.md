# 项目开发记录

## 记录范围

本记录根据当前源码、数据库迁移和既有项目说明整理。2026-10-15 建立仓库时，现有代码按模块分别提交；Git 时间表示实际提交时间，不用于推定各功能最初的开发时间。各模块存在相互依赖，中间提交不承诺可以独立运行。

以下阶段依据系统说明、展示站说明、接口文档及对应源码整理。功能实现说明和实际验收结果分别记录；数据库迁移目录名称只作为该迁移的标识。

## 详细专题

| 专题 | 记录内容 |
| --- | --- |
| [展示站与画册整理](qingjin/docs/history/01-showcase.md) | 数据处理、双语页面、产品查找、对比与联系入口 |
| [数据模型与鉴权](qingjin/docs/history/02-authentication.md) | 模型、迁移、登录刷新、角色与管理员保护 |
| [分类、机型与媒体](qingjin/docs/history/03-catalog-media.md) | 参数模板、编辑、复制、排序、图片处理及引用 |
| [发布与回滚](qingjin/docs/history/04-publishing.md) | 快照差异、构建、预览认证、失败处理与版本保留 |
| [站点设置](qingjin/docs/history/05-site-settings.md) | 双语文案、图片配置、联系方式与兼容字段 |
| [访问统计](qingjin/docs/history/06-analytics.md) | 事件清洗、匿名标识、保留策略及指标口径 |
| [后台、Excel 与审计](qingjin/docs/history/07-admin-excel-audit.md) | 页面组织、表结构、预检查、事务与操作追溯 |
| [部署与备份](qingjin/docs/history/08-deployment-backup.md) | 容器分工、初始化、调度、下载与恢复边界 |

## 开发阶段

| 阶段 | 既有资料记载的工作 | 当前源码位置 |
| --- | --- | --- |
| 展示站与画册整理 | 画册页面提取、产品图片裁剪、107 台设备与 8 个分类的数据整理；中英双语页面、搜索、机型对比和询盘入口 | `qingjin-site/scripts/`、`src/data/`、`src/pages/`、`public/`；`画册问题清单.md` |
| 后台阶段 1 | 数据模型与迁移、展示站数据导入、登录鉴权、角色守卫、只读机型及分类接口、后台基础界面 | `qingjin/server/prisma/`、`src/cli/`、`src/auth/`；`qingjin/admin/src/` |
| 后台阶段 2 | 分类和参数模板、机型编辑与批量操作、排序、图片处理与媒体引用保护、写入操作审计 | `qingjin/server/src/categories/`、`machines/`、`media/`、`audit/`；对应后台页面 |
| 后台阶段 3 | 发布差异、快照构建、版本切换、历史回滚、独立预览与构建日志 | `qingjin/server/src/publish/`；后台 `ReleasesView.vue` |
| 后台阶段 4 | 中英站点设置、联系方式、工厂与证书图片管理及发布联动 | `qingjin/server/src/settings/`；后台 `SettingsView.vue`；展示站页面 |
| 后台阶段 5 | 访问埋点、事件汇总、趋势及来源分析、仪表盘 | `qingjin/server/src/stats/`；后台 `DashboardView.vue`；展示站 `Analytics.astro` |
| 后台阶段 6 | 用户与角色管理、操作日志筛选、Excel 检查与导入导出、数据库及图片备份 | `qingjin/server/src/users/`、`audit/`、`excel/`、`backups/`；对应后台页面；`qingjin/deploy/` |
| 部署与使用说明 | Docker 镜像、Compose 服务、Nginx 路由、定时备份、恢复流程与后台使用指南 | `qingjin/server/Dockerfile`、`qingjin/deploy/`、各 README、后台 `GuideView.vue` |

## 首次仓库提交顺序

1. 仓库规范：根目录忽略规则，排除环境密钥、本地数据、生成物与临时素材。
2. 展示站：导入当前展示站代码、产品数据、静态图片、处理脚本和已有说明。
3. API：导入当前 API、数据库模型、迁移及冒烟脚本。将服务端运行目录的忽略规则限定到模块根目录，确保 `src/publish/` 和 `src/backups/` 源码被跟踪。
4. 后台界面：导入当前后台代码、锁文件及使用说明。
5. 部署配置：导入 Compose、Nginx 和备份脚本。
6. 项目文档：导入既有系统与接口说明，新增统一入口和本历史说明。

## 验证范围

本会话此前已通过展示站检查与构建、API 类型检查与构建、后台类型检查与构建。展示站生成 226 个页面，检查有一条临时脚本未使用变量提示。此次仅完善文档，检查文档格式、链接、源码路径及提交范围，不重复执行应用构建。

已有冒烟脚本需要运行中的 API、数据库及管理员账号，部分会修改数据或触发发布，此次未执行。生产部署、真实联系渠道、备份恢复和历史回滚的端到端结果不能由类型检查或构建成功推定。
