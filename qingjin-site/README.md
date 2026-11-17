# 青瑾机械产品展示站

基于 Astro 7、TypeScript 和 Tailwind CSS 4 的中英双语静态网站。当前版本包含 178 台设备、9 个分类，以及产品参数、图集、文字和图片板块。

正式入口：[中文](https://qingjinmachinery.cn/zh/) · [English](https://qingjinmachinery.cn/en/)

## 开发与构建

需要 Node.js 24。以下命令在本目录执行：

```powershell
npm.cmd ci
npm.cmd run dev
npm.cmd run check
npm.cmd run build
npm.cmd run preview
```

开发服务默认使用 `http://localhost:4321`。构建结果位于 `dist/`，不提交到 Git。

站点地址默认使用 `https://qingjinmachinery.cn`。其他环境应在构建前设置 `SITE_URL`：

```powershell
$env:SITE_URL='https://qingjinmachinery.cn'
npm.cmd run build
```

该值影响 canonical、hreflang、Open Graph 和 sitemap。更改域名后必须重新构建，不能只修改 Nginx。

## 页面与功能

| 路径 | 功能 |
| --- | --- |
| `/zh/`、`/en/` | 双语首页 |
| `/{lang}/products/` | 分类筛选及型号、名称搜索，支持 `?cat=&q=` |
| `/{lang}/products/{id}/` | 产品参数、图片、视频及内容板块 |
| `/{lang}/compare/` | 最多 4 台设备对比，支持 `?ids=a,b,c` |
| `/{lang}/about/` | 企业介绍、工厂照片与资质资料 |
| `/{lang}/contact/` | 联系方式与二维码，支持 `?model=` 机型提示 |

根路径根据浏览器语言跳转。联系页没有在线提交表单；`formEndpoint` 为历史兼容字段。

## 数据与媒体

| 路径 | 内容 |
| --- | --- |
| `src/data/machines.json` | 178 台设备及双语参数、图集和内容板块 |
| `src/data/categories.json` | 9 个分类 |
| `src/data/site.json` | 企业资料和联系配置的初始快照 |
| `public/images/` | 品牌、产品、工厂、证书及详情图片 |
| `src/components/Footer.astro` | 中英文公共页脚和 ICP 备案链接 |

当前目录具有 166 个文字板块和 81 个图片板块，分别覆盖 142 台和 79 台设备。数据中的 `notes`、`source` 为内部维护信息，不应展示在公开页面。

生产系统以 PostgreSQL 为内容源，发布服务在临时工作目录生成该版本的 JSON 再构建。仓库 JSON 不代表后台实时内容，不得通过重新导入覆盖运营人员的修改。

## 画册处理

画册 156 为当前产品目录来源，历史画册 33 的核验资料单独保留：

- [当前目录核验清单](画册156问题清单.md)
- [历史目录核验清单](画册问题清单.md)

当前处理工具为 `scripts/merge_data_156.py` 和 `scripts/crop_machines_156.py`，裁剪信息及转录资料位于 `scripts/work156/`。原始 PDF、渲染页和大型临时素材不纳入仓库。

重新生成会覆盖手工维护的数据。执行前应保存工作副本、核对画册版本并检查差异，不得把素材重生成当作常规上线命令。

## 生产发布

展示站源码与构建依赖封装在 API 镜像中。修改页面模板、样式、默认站点地址或页脚后，必须：

1. 更新服务器源码并构建 API 镜像。
2. 重建 API 容器，确认服务就绪。
3. 检查并平滑重载内部 Nginx。
4. 通过发布中心或 `npm run publish:site:prod` 生成正式版本。
5. 验证中英文页面、静态资源、站点地址和备案链接。

公共页脚展示 [](https://beian.miit.gov.cn/)。公安联网备案数据码不得作为页脚内容；正式公安备案号在取得后单独配置。

完整流程见 [生产部署指南](../腾讯云部署流程.md)。上传本地 `dist/` 或推送 GitHub 不会自动更新后台管理的正式版本。
