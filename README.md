# 青瑾机械 · QING JIN MACHINERY

中英双语包装机械产品展示与内容管理平台，集产品目录、设备参数、机型对比、企业展示、联系咨询和后台发布于一体。

[中文网站](https://qingjinmachinery.cn/zh/) · [English](https://qingjinmachinery.cn/en/) · [管理后台](https://admin.qingjinmachinery.cn/admin/) · [部署指南](腾讯云部署流程.md) · [版本记录](CHANGELOG.md)

## 项目概况

| 项目 | 当前状态 |
| --- | --- |
| 源码版本 | `v1.0.0`，以 Git 标签标识 |
| 产品目录 | 178 台设备、9 个分类，来源于画册 156 |
| 详情内容 | 双语参数、产品图集、文字及图片板块，支持产品视频 |
| 网站语言 | 简体中文、英文 |
| 正式域名 | `qingjinmachinery.cn`，`www` 跳转至主域名 |
| 管理域名 | `admin.qingjinmachinery.cn`，预览与 API 通过同域名代理 |
| ICP 网站备案号 | [](https://beian.miit.gov.cn/) |

以上目录数量为本版本源码基线；生产内容以数据库和成功发布的快照为准。Git 标签与后台的 `v11` 等网站发布编号是两套独立记录，不互相替代。

## 核心功能

### 产品展示

- 按分类、型号和中英文名称查找设备。
- 浏览设备参数、图片、产品优势、适用产品、配置及案例资料。
- 同时比较最多 4 台设备，支持带机型信息的联系入口。
- 展示工厂照片、资质资料及企业介绍。
- 提供电话、邮件、WhatsApp、微信等联系渠道。
- 输出 canonical、hreflang、Open Graph 和 sitemap，公共页脚展示 ICP 备案链接。

### 内容管理

- 管理分类、参数模板、机型、推荐顺序、图片及产品视频。
- 编辑双语文字板块和图片板块，调整详情内容顺序。
- 维护公司资料、联系方式、工厂照片、证书及微信二维码。
- 保存后预览、发布，查看差异、日志和历史版本，按快照重新构建回滚版本。
- 使用 Excel 预检查及导入导出、角色权限、操作审计、访问统计和数据备份。

本项目用于产品介绍、选型辅助和采购咨询，不包含在线支付或订单交易流程。当前联系页没有在线询盘表单，`formEndpoint` 为兼容字段；联系入口点击不代表有效询盘或成交。

## 技术架构

| 模块 | 技术 |
| --- | --- |
| 展示站 | Astro 7、TypeScript、Tailwind CSS 4 |
| 管理界面 | Vue 3、Vite 8、Element Plus、Pinia |
| 后端 API | NestJS 11、Prisma 7、PostgreSQL 16 |
| 媒体处理 | Sharp、FFmpeg |
| 运行与部署 | Node.js 24、Docker、Docker Compose、Nginx |

```text
浏览器
  └─ edge Nginx：HTTPS、域名跳转
      └─ 内部 Nginx：展示站、后台静态文件、同源代理
          ├─ API：鉴权、内容管理、预览、发布构建
          └─ PostgreSQL：业务数据、账号、快照与审计
备份服务：定时归档数据库和上传文件
```

生产环境使用独立 Compose 项目和网络，不依赖其他业务的容器。只有入口服务发布 80/443，数据库、API 和预览端口不对公网开放。

## 仓库结构

| 路径 | 内容 | 文档 |
| --- | --- | --- |
| `qingjin-site/` | 展示站、静态目录及画册处理工具 | [展示站说明](qingjin-site/README.md) |
| `qingjin/admin/` | 管理界面 | [后台说明](qingjin/admin/README.md) |
| `qingjin/server/` | API、模型、数据库迁移 | [系统说明](qingjin/README.md) |
| `qingjin/deploy/` | Compose、Nginx、备份脚本 | [部署指南](腾讯云部署流程.md) |
| `qingjin/docs/` | 接口约定与模块设计记录 | [项目开发记录](PROJECT_HISTORY.md) |

## 本地运行

需要 Node.js 24 和 npm。仅运行展示站时，在仓库根目录执行：

```powershell
npm.cmd --prefix qingjin-site ci
npm.cmd --prefix qingjin-site run dev
```

默认访问 `http://localhost:4321`。完整后台开发需要 PostgreSQL、API 和管理界面，启动方式见 [系统开发说明](qingjin/README.md#本地开发)。

独立构建展示站：

```powershell
$env:SITE_URL='https://qingjinmachinery.cn'
npm.cmd --prefix qingjin-site run check
npm.cmd --prefix qingjin-site run build
```

生产发布由 API 读取数据库快照并构建，不应直接上传本地 `dist` 覆盖正式站点。

## 验证与发布

在依赖安装完成后，从仓库根目录逐项执行：

```powershell
npm.cmd --prefix qingjin-site run check
npm.cmd --prefix qingjin-site run build
npm.cmd --prefix qingjin/server run db:generate
npm.cmd --prefix qingjin/server run typecheck
npm.cmd --prefix qingjin/server run build
npm.cmd --prefix qingjin/admin run typecheck
npm.cmd --prefix qingjin/admin run build
git diff --check
```

每项成功后再执行下一项。Prisma 生成所需环境配置见系统说明。涉及写入、发布或恢复的冒烟测试仅在隔离环境执行，不作为生产日常巡检命令。

## 部署与运维

生产入口、证书、端口、首次初始化、更新、备份及回滚操作见 [腾讯云部署与运维指南](腾讯云部署流程.md)。

- 数据卷、上传文件、备份、构建产物、环境文件、私钥和管理员凭据不进入 Git。
- 模板更新需要更新 API 镜像并重新发布；推送 GitHub 不会自动部署。
- 数据库恢复与内容回滚是不同操作，执行前须确认目标环境及备份。
- 源码中的联系配置可能保留示例值，真实联系方式及企业资料应由运营方在后台维护并验证。
- 公安联网备案数据码不属于公开备案号，不写入网页或版本库；取得正式公安备案号后再单独配置展示。

## 项目资料

- [版本记录](CHANGELOG.md)
- [项目开发记录](PROJECT_HISTORY.md)
- [画册 156 数据核验清单](qingjin-site/画册156问题清单.md)
- [历史画册核验记录](qingjin-site/画册问题清单.md)
- [接口约定](qingjin/docs/api-phase456.md)
