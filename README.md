# 青瑾机械网站与后台

统一管理中英双语产品展示站、后台界面、API 和部署配置。保留原有目录，后台通过 `SITE_DIR` 引用展示站。

| 目录 | 内容 | 开发与部署说明 |
| --- | --- | --- |
| `qingjin-site/` | Astro 展示站、产品数据、图片及画册处理脚本 | [展示站说明](qingjin-site/README.md) |
| `qingjin/admin/` | Vue 后台管理界面 | [后台说明](qingjin/admin/README.md) |
| `qingjin/server/` | NestJS API、Prisma 模型与迁移 | [系统说明](qingjin/README.md) |
| `qingjin/deploy/` | Docker Compose、Nginx、备份脚本 | [部署说明](qingjin/README.md#生产部署海外服务器--cloudflare) |

开发阶段及 Git 补录边界见 [项目历史](PROJECT_HISTORY.md)。

## 本地验证

使用 Node.js 24，在各模块安装锁文件指定的依赖后执行：

```powershell
npm --prefix qingjin-site run check
npm --prefix qingjin-site run build
npm --prefix qingjin/server run db:generate
npm --prefix qingjin/server run typecheck
npm --prefix qingjin/server run build
npm --prefix qingjin/admin run build
```

Prisma 生成命令需要按系统说明配置本地 `.env`。本地数据库、上传文件、备份、发布产物、环境密钥及生成的 Prisma 客户端均不纳入 Git。

展示站已包含运行所需的静态图片和数据。重新处理画册时需另行准备根目录的 `画册33.pdf` 及 `scripts/work/` 中间资料；这些本地素材保持原样，不随源码推送。根目录三个空 Vue 临时文件也不纳入版本控制。
