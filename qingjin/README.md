# 青瑾机械 后台管理系统

前后端分离：展示站（Astro 静态站）+ 后台前端（Vue 3）+ 后端 API（NestJS）。

```
qingjin/
├─ server/   NestJS 11 + Prisma 7 + PostgreSQL（API、鉴权、数据导入）
├─ admin/    Vue 3 + Vite + Element Plus（后台界面，见 admin/README.md）
└─ deploy/   docker-compose、nginx 配置（生产部署）
../qingjin-site/   现有展示站（暂未移动位置，server 通过 SITE_DIR 引用）
```

## 当前进度

阶段 1 已完成：
- 数据库表（机型、参数、分类、参数模板、媒体、站点设置、发布版本、用户、刷新令牌、操作日志、访问事件、每日统计）
- 从展示站导入 107 台机型、8 个分类、75 条参数模板、107 张图片和 site.json；导入后自动导出回站点格式逐项比对，结果完全一致
- 登录鉴权：JWT（15 分钟）+ 刷新令牌（7 天，每次刷新轮换；旧令牌被重用时整条链作废）、bcrypt、登录限频（每 IP 每分钟 5 次）、角色守卫、登录日志
- 只读接口：分类列表、机型列表（搜索、分类、状态筛选、分页）、机型详情
- 后台界面骨架：登录页、侧边栏布局（手机端为抽屉菜单）、机型列表、分类列表，其余页面为占位

阶段 2 已完成：
- 分类：新增、修改、删除（下面还有机型时禁止删除）、拖拽排序；每个分类的参数模板可编辑
- 机型：新增、编辑（基本信息、参数、图片、SEO、内部备注）、删除、复制（复制品为草稿）、批量上架/下架/草稿/推荐/删除、分类内拖拽排序
- 媒体库：上传时可裁剪；自动按照片方向旋转，最长边不超过 1600px，默认补白成正方形，统一存为 WebP；内容相同的图片自动去重；被机型使用的图片不能删除
- 权限：只读账号（VIEWER）只能查看；所有修改都写入操作日志，并记录改了哪些字段、参数和图片

阶段 3 已完成：
- 发布中心：显示和线上版本相比的待发布改动（新增、下架、修改了哪些字段，排序、分类、站点设置是否变化）
- 发布：把数据库当前内容存成快照 → 在临时目录构建展示站（约 20–30 秒）→ 构建成功后把 `current` 链接原子切换到新版本；构建失败时线上站点不受影响，日志可在后台查看
- 同一时间只允许一个构建；API 重启时，未完成的发布会被标记为失败
- 回滚：选择任一成功的历史版本，用它当时的快照重新构建为一个新版本。数据库里还没发布的修改不受影响，会继续显示为待发布
- 预览：把未发布的改动构建到独立的预览站（单独端口/域名）。从后台点“打开预览”会生成 10 分钟有效的链接，换成 8 小时的 HttpOnly Cookie；预览站禁止搜索引擎收录
- 首页推荐机型改为读取机型的“推荐”标记；内部备注不会发布到网站
- 磁盘上保留最近 `KEEP_RELEASES`（默认 10）个构建结果，快照永久保存在数据库，所以更早的版本也能回滚

阶段 4 已完成（站点设置）：
- 后台“站点设置”页：公司名称、口号、工厂/资质介绍语、地址（中英文）、电话/邮箱/WhatsApp/微信、询盘表单提交地址、关于页大图、工厂照片和证书（可增删、拖拽排序、改标题说明）
- 照片和证书的图片来自媒体库（用途“站点图片”，不补白成正方形）；正在被站点设置使用的图片不能删除，图片详情里会显示用在哪里
- 修改保存后显示在发布中心的待发布里，发布后才上线；展示站的关于页、首页工厂/证书条、联系页都读取这些设置
- 已有站点的 9 张工厂照片和 7 张证书已导入（`npm run import:site -- --site-only` 只重新导入站点设置，不动机型）

阶段 5 已完成（访问统计）：
- 展示站埋点：页面浏览（含机型、来源网站）、站内搜索（含无结果的搜索）、加入对比、询盘点击（表单、邮件、电话、WhatsApp、微信）。不用 Cookie，不存 IP：访客 ID 是“日期 + IP + 浏览器”的哈希，每天更换；开启“请勿跟踪”的浏览器、爬虫、监控工具和自动化浏览器不统计
- 国家来自 Cloudflare 的 `CF-IPCountry`；接口限频每 IP 每分钟 120 次，无效数据静默丢弃
- 原始事件每 10 分钟按天（北京时间）汇总一次；仪表盘查看时当天数据最多延迟 1 分钟；原始事件保留 `TRACK_RETENTION_DAYS`（默认 180）天，每日汇总永久保留
- 仪表盘：机型/分类/线上版本/今日卡片，可选 7/30/90 天或自定义范围，和上一同长时段对比，访问趋势图，热门机型、热门页面、来源网站、国家、设备、语言、询盘渠道、热门搜索、无结果搜索，最近 30 分钟实时数据
- 只有正式发布的站点带埋点；预览站和本地直接 `npm run dev` 的展示站不带

阶段 6 已完成：
- 用户与角色（仅超级管理员）：新增、改显示名/角色、停用、重置密码、删除；不能降级/停用/删除自己，至少保留一个启用的超级管理员。停用或改角色立即生效（每次请求都会从数据库核对账号状态）并让该用户所有登录失效
- 每个人可在右上角菜单“修改密码”，改完后其他设备上的登录失效
- 操作日志页（仅超级管理员）：按用户、对象、操作、日期、关键字筛选，查看每条的改动详情和 IP；删除用户后其历史记录仍保留
- Excel：按分类/状态导出机型和参数；导入时先“检查文件”预览新增和修改（逐行报错，有错误时什么都不写入），确认后再应用。按 slug 匹配，不会删除机型，不处理图片
- 备份：生产环境的 `backup` 容器每天定时备份数据库（pg_dump）和全部图片，保留最近 `BACKUP_KEEP` 份；后台“导入导出 → 数据备份”可查看、下载、手动触发

## 本地开发（Windows，无需 Docker）

需要 Node 24。开 3 个终端：

```powershell
# 1. 数据库（内嵌 PostgreSQL，数据在 server/.devdb，端口 5433）
cd server; npm install; npm run db:dev

# 2. API（首次需要迁移、导入、创建管理员）
cd server
copy .env.example .env          # 已有 .env 可跳过；JWT_ACCESS_SECRET 请改成随机长字符串
npx prisma migrate dev
npm run import:site             # 导入展示站数据并校验；只校验用 npm run import:site -- --check
$env:ADMIN_PASSWORD='至少10位的密码'; npm run seed:admin
npm run publish:site            # 首次发布，生成 server/publish/current（展示站需先 npm install）
npm run dev                     # http://localhost:3000/api ，接口文档 http://localhost:3000/api/docs
                                # 同时启动 预览站 http://localhost:4400 和 已发布站点 http://localhost:4321

# 3. 后台界面
cd admin; npm install; npm run dev   # http://localhost:5174
```

冒烟测试（API 运行时）：
- `$env:SMOKE_PASSWORD='管理员密码'; npm run smoke`：登录、令牌轮换、只读接口（19 项）
- `$env:SMOKE_PASSWORD='管理员密码'; npm run smoke:write`：权限、分类与模板、图片上传与裁剪、机型增删改/复制/批量/排序、引用保护（50 项）。会临时创建 `smoke-` 开头的数据和 `smoke-viewer` 账号，结束时全部删除

- `$env:SMOKE_PASSWORD='管理员密码'; npm run smoke:publish`：待发布差异、权限、并发冲突、发布后站点变化、预览链接与 Cookie、回滚后站点恢复（35 项）。会临时改一台机型的名称并在结束时改回，历史里会多出两个版本（一次发布、一次回滚），线上内容与测试前一致

- `$env:SMOKE_PASSWORD='管理员密码'; $env:BACKUP_DIR='./backups-dev'; npm run smoke:admin`：站点设置与图片保护、埋点过滤与统计、用户/角色/停用立即生效、修改密码、操作日志、Excel 导出→检查→导入→还原、备份列表/下载/手动触发（73 项）。API 也要带同样的 `BACKUP_DIR` 启动才能测到备份；测试会等最多 1 分钟让当天统计刷新，结束时还原所有改动

几个脚本都会登录，登录限频为每分钟 5 次，连续运行时中间隔一分钟。

本地统计：`.env` 里的 `TRACK_ENDPOINT=http://localhost:3000/api/track` 让本地已发布站点（4321）把埋点发到 API；改了它要重新发布一次才生效。

`seed:admin` 不设 `ADMIN_PASSWORD` 时会生成随机密码并只显示一次；对已有账号再次执行会重置密码并让该账号所有登录失效。

## 生产部署（海外服务器 + Cloudflare）

```bash
# 服务器上：先构建后台（展示站源码会打包进 API 镜像，由发布功能构建）
(cd qingjin/admin && npm ci && npm run build)

cd qingjin/deploy
cp .env.example .env            # 填 POSTGRES_PASSWORD、JWT_ACCESS_SECRET（openssl rand -base64 48）、PREVIEW_HOST
docker compose up -d --build    # 需要 Docker Compose v2.17+；API 启动时自动执行数据库迁移

# 首次：导入数据、创建管理员、第一次发布（之后都在后台“发布中心”操作）
docker compose exec api npm run import:site:prod
docker compose exec -e ADMIN_PASSWORD='强密码' api npm run seed:admin:prod
docker compose exec api npm run publish:site:prod
```

访问路径：`/` 展示站，`/admin/` 后台，`/api/` 接口，`/uploads/` 图片；`PREVIEW_HOST`（例如 `preview.你的域名`）是预览站，需要在 Cloudflare 里加一条代理的 DNS 记录指向同一台服务器。Cloudflare 负责 HTTPS；如果不经过 Cloudflare 直连服务器，把 `.env` 里的 `TRUST_PROXY` 改为 1。

- 构建好的版本放在 `publish` 卷里，nginx 通过 `current` 链接提供展示站，发布和回滚都不需要重启任何容器
- 修改了展示站的页面模板或样式（`qingjin-site/src` 里除数据以外的部分）后，需要 `docker compose up -d --build api` 重建镜像，再在后台发布一次
- 埋点发到同域名的 `/api/track`（compose 里的 `TRACK_ENDPOINT`），不需要额外配置；Cloudflare 自动带上访客国家

### 备份与恢复

`backup` 容器（`deploy/backup.sh`）每天 `BACKUP_AT`（北京时间，默认 03:30）把数据库和图片备份到 `backups` 卷，文件名 `db-日期-时间.sql.gz`、`uploads-日期-时间.tar.gz`，各保留 `BACKUP_KEEP`（默认 14）份。后台点“立即备份”约 15 秒内开始。

备份和数据在同一台服务器上，服务器坏了会一起丢，请定期下载最新的两个文件（后台可直接下载），或在服务器上用 rclone 等同步到别处。

恢复（会覆盖现有数据，先停 API）：

```bash
cd qingjin/deploy
docker compose stop api
# 数据库
docker compose exec -T backup sh -c 'gunzip -c /backups/db-XXXXXXXX-XXXXXX.sql.gz | psql -h db -U qingjin -d qingjin'
# 图片（backup 容器里 uploads 是只读的，用一次性容器解压）
docker compose run --rm --no-deps -v deploy_uploads:/uploads --entrypoint sh backup -c 'tar -xzf /backups/uploads-XXXXXXXX-XXXXXX.tar.gz -C /uploads'
docker compose start api        # 然后在后台发布一次
```

（`deploy_uploads` 是 compose 给 uploads 卷起的名字，以 `docker volume ls` 为准。）

## 注意

- 后台的修改要在“发布中心”发布后才会出现在展示站上。发布时会把数据库内容写入临时目录里的 `src/data/*.json` 再构建，`qingjin-site` 目录本身不会被改动。
- 回滚会用到当时快照引用的图片；被任何机型使用的图片本来就不能删除，但如果某张图只在旧版本里用过并已被删除，回滚到那个版本会构建失败（线上不受影响）。
- `machines.json` 里的 `notes`（画册转录备注）已导入为机型的内部备注，不会发布到网站。
- 本地开发用的管理员密码和 `.env` 只在本机，不要提交到代码仓库（已写入 `.gitignore`）。

- 联系方式目前还是占位内容（`+86 000…`、`sales@example.com`），上线前在“站点设置”里改成真实的并发布。
- 接口约定见 `docs/api-phase456.md`。
