# 青瑾机械内容管理系统

系统由 NestJS API、PostgreSQL、Vue 管理界面和 Astro 展示站组成，提供产品维护、媒体管理、网站预览与发布、运营统计及权限审计。

[管理后台](https://admin.qingjinmachinery.cn/admin/) · [部署与运维](../腾讯云部署流程.md) · [接口约定](docs/api-phase456.md) · [版本记录](../CHANGELOG.md)

## 目录与职责

```text
qingjin/
  server/        API、Prisma 模型、数据库迁移和发布服务
  admin/         Vue 管理界面
  deploy/        Compose、Nginx、备份脚本和命令包装
  docs/          接口约定与模块设计记录
qingjin-site/    展示站源码、静态目录和媒体素材
```

`SITE_DIR` 指向展示站源码。生产镜像中的 API 工作目录为 `/app`，展示站目录为 `/site`；上传、发布和备份分别挂载到 `/data` 下的独立命名卷。

## 功能范围

| 模块 | 能力 |
| --- | --- |
| 分类与参数模板 | 分类维护、排序、统一参数键和标签 |
| 机型 | 双语资料、参数、SEO、图集、视频、推荐及批量状态操作 |
| 详情板块 | 双语文字和图片板块、标题说明、排序及媒体引用 |
| 站点设置 | 企业介绍、联系方式、工厂照片、证书和二维码 |
| 发布中心 | 快照差异、临时构建、原子版本切换、认证预览及历史回滚 |
| 用户与权限 | 超级管理员、编辑者、只读角色，账号状态和管理员保护 |
| Excel | 导出、逐行预检查、按 slug 导入及事务写入 |
| 访问统计 | 访问趋势、热门机型、搜索及联系渠道点击 |
| 备份与审计 | 数据库与上传文件归档、手动触发、下载及操作追溯 |

当前初始目录为 178 台设备、9 个分类。数据导入支持 `--check`、`--machines-only`、`--site-only` 和 `--replace`；其中重新导入会覆盖匹配机型，`--replace` 还会删除不在输入目录中的机型和无引用分类，不属于常规更新流程。

## 本地开发

需要 Node.js 24。可使用现有 PostgreSQL，也可运行项目提供的本地开发数据库。以下命令均从仓库根目录开始，在不同终端运行。

### 安装依赖

```powershell
npm.cmd --prefix qingjin/server ci
npm.cmd --prefix qingjin/admin ci
npm.cmd --prefix qingjin-site ci
```

仅在尚无配置文件时，将 `qingjin/server/.env.example` 复制为 `.env`，按实际环境设置数据库连接和随机 JWT 密钥。不得覆盖已有环境文件。

模板中的数据库连接、JWT 密钥、管理员密码及页脚部署值故意留空，须在被忽略的 `.env` 中填写。生成 JWT 密钥可用 `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`，不能照抄公开固定字符串。

### 数据库

```powershell
npm.cmd --prefix qingjin/server run db:dev
```

默认开发数据位于 `qingjin/server/.devdb`，使用端口 5433。不要让本地开发命令连接生产数据库。

`db:dev` 的固定凭据只用于本地开发，配套连接示例为 `postgresql://qingjin:qingjin_dev@127.0.0.1:5433/qingjin`，应仅填入本地 `.env`；它不是生产数据库连接。

### API

在 `qingjin/server` 目录依次执行：

```powershell
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run import:site
# 仅隔离的本地空数据库首次演示，生产不得使用下列示例密码：
$env:ADMIN_USERNAME='admin'
$env:ADMIN_PASSWORD='1234567890'
npm.cmd run seed:admin
Remove-Item Env:ADMIN_USERNAME
Remove-Item Env:ADMIN_PASSWORD
npm.cmd run publish:site
npm.cmd run dev
```

上述示例创建 `admin`，密码为 `1234567890`，仅用于本地演示，不是线上账号或自动默认密码。真实环境密码至少 10 位，应使用密码管理器生成的随机强密码。`seed:admin` 会按用户名创建或重置账号，并撤销刷新会话；不能用于已有环境的普通部署或账号改名。

### 管理界面

```powershell
npm.cmd --prefix qingjin/admin run dev
```

| 服务 | 本地地址 |
| --- | --- |
| API | `http://localhost:3000/api` |
| API 文档 | `http://localhost:3000/api/docs` |
| 管理界面 | `http://localhost:5174` |
| 独立展示站开发 | `http://localhost:4321` |
| API 内置预览 | `http://localhost:4400` |

API 的本地已发布站点与 Astro 开发服务均可能使用 4321，不要同时占用同一端口。

## 鉴权与安全边界

- 访问令牌默认 15 分钟，刷新令牌默认 7 天，刷新时轮换并保存摘要。
- 登录按来源限频，受保护请求重新检查账号状态和角色。
- 停用账号立即阻止受保护访问；刷新会话撤销不等于立即撤销所有已签发访问令牌。
- 修改用户名应保留原用户 ID，避免丢失发布和审计关联。
- 真实账号、密码、令牌及实际环境密钥不保存到文档或 Git；公开初始化示例不得用于生产。

## 生产部署

当前采用独立腾讯云部署，不依赖其他业务的反向代理或容器网络：

```bash
cd /opt/qingjin/qingjin/deploy
sh ./qj.sh config -q
sh ./qj.sh ps
```

`qj.sh` 固定项目名 `qingjin`，组合基础配置、腾讯云配置及独立 HTTPS 入口配置。需要 Docker Compose 2.24.4 或更高版本。

正式站使用 `qingjinmachinery.cn`，后台和认证预览使用 `admin.qingjinmachinery.cn`。所有入口通过 HTTPS，只有 `edge` 发布 80/443；5432、3000 和 4400 不对公网开放。

完整安装、证书、初始化、更新、备份和恢复流程见 [生产部署指南](../腾讯云部署流程.md)。基础 `docker-compose.yml` 仍可用于其他拓扑，但端口、证书、预览主机名和 `TRUST_PROXY` 必须按实际链路配置。

## 内容发布与恢复

保存内容只修改数据库，正式展示站在发布成功后更新。内容回滚从历史快照重新构建新版本，不恢复数据库中的未发布编辑，也不等同于镜像或数据库回滚。

定时备份分别生成数据库和上传文件归档；生产配置保留 7 组近期文件、3 个构建目录。历史快照仍保存在数据库中，但其图片依赖和模板兼容性必须另行保证。同机备份不能抵御整机故障。

## 验证

```powershell
npm.cmd --prefix qingjin/server run db:generate
npm.cmd --prefix qingjin/server run typecheck
npm.cmd --prefix qingjin/server run build
npm.cmd --prefix qingjin/admin run typecheck
npm.cmd --prefix qingjin/admin run build
```

`smoke`、`smoke:write`、`smoke:publish` 和 `smoke:admin` 需要运行中的服务与测试账号。部分脚本会创建数据、重置资料或产生网站版本，只能在隔离环境中执行。构建成功不能代替数据恢复、真实联系渠道或高并发验收。
