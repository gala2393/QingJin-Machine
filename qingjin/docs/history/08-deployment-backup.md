# 部署架构、备份与运维

## 当前生产结构

| 服务 | 职责 | 公网暴露 |
| --- | --- | --- |
| `edge` | HTTPS、域名转发、`www` 跳转 | 80、443 |
| `nginx` | 展示站及后台静态资源、API 与预览代理 | 无 |
| `api` | 鉴权、业务接口、媒体处理、预览与发布 | 无 |
| `db` | PostgreSQL 业务数据、账号、快照与审计 | 无 |
| `backup` | 数据库和上传文件的定时及手动备份 | 无 |

Compose 项目固定为 `qingjin`，内部网络为 `qingjin_default`，专属入口网络为 `qingjin_ingress`。服务不依赖其他项目的共享入口。

`qj.sh` 组合 `docker-compose.yml`、`docker-compose.tencent.yml` 和 `docker-compose.new-edge.yml`。配置使用 `!reset`、`!override`，需要 Docker Compose 2.24.4 或更高版本。

## 构建与更新

命名构建上下文将展示站源码及工具链封装到 API 镜像。后台使用单独构建的静态产物挂载。模板变化需要更新镜像并重新发布，后台变化需要替换后台构建；推送代码或标签不等于完成生产部署。

请求依次经过入口和内部 Nginx，因此当前 `TRUST_PROXY=2`。后台域名同时承载受保护的预览服务，不需要开放 4400。

## 数据卷

| 卷 | 内容 |
| --- | --- |
| `qingjin_pgdata` | PostgreSQL 数据目录 |
| `qingjin_uploads` | 上传图片、视频及相关媒体 |
| `qingjin_publish` | 发布目录、预览和当前版本链接 |
| `qingjin_backups` | 数据库及上传文件归档 |

不能直接复制正在运行的数据库数据目录作为一致性备份。迁移采用逻辑导出，并在最终同步期间停止后台写入和备份任务。

## 备份调度

默认北京时间 03:30 执行，保留数由 `BACKUP_KEEP` 控制，当前示例及生产值为 7；基础 Compose 未设置该变量时回退为 14。

数据库文件按 `db-日期-时间.sql.gz` 命名，上传文件按 `uploads-日期-时间.tar.gz` 命名。脚本先写临时文件再改名，分别记录结果并清理历史归档。后台写入 `.request` 请求备份，出现请求或日志不等于两类归档均已成功。

## 恢复与回滚

内容回滚、镜像回滚和数据库恢复必须分别规划。正式迁移已执行数据库恢复、文件摘要和业务数量核对；同机定时归档的完整恢复演练及整机灾难恢复仍需单独安排。

旧快照可能依赖历史图片，数据库和上传文件也不天然具有同一时刻的一致性。恢复前应确认配套归档、目标环境、文件权限、迁移兼容性和新数据处理方案。同机备份必须另行保存异地副本。

## 运维依据

- [部署与运维指南](../../../腾讯云部署流程.md)
- `qingjin/deploy/docker-compose*.yml`
- `qingjin/deploy/nginx.tencent*.conf`
- `qingjin/deploy/backup.sh`
- `qingjin/server/Dockerfile`
- `qingjin/server/src/backups/backups.service.ts`
