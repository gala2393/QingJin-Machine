# 青瑾机械产品展示站 / QING JIN MACHINERY Showcase

基于 Astro 5 + Tailwind CSS v4 的中英双语静态站，收录画册中全部 107 台设备及参数。

## 常用命令

```bash
npm install
npm run dev        # 本地开发 http://localhost:4321
npm run build      # 生成静态站到 dist/
npm run preview    # 预览 dist/
npx astro check    # 类型检查
```

`dist/` 可直接部署到任意静态托管（Nginx、Netlify、Vercel、Cloudflare Pages、阿里云 OSS 等）。

## 页面

| 路径 | 说明 |
|---|---|
| `/zh/`、`/en/` | 首页（根路径按浏览器语言跳转） |
| `/{lang}/products/` | 产品中心：分类筛选 + 搜索，支持 `?cat=&q=` |
| `/{lang}/products/{id}/` | 产品详情与参数表 |
| `/{lang}/compare/` | 机型对比（最多 4 台，可用 `?ids=a,b,c` 直接打开） |
| `/{lang}/about/` | 工厂实拍与资质证书 |
| `/{lang}/contact/` | 联系方式与询价表单（支持 `?model=` 预填） |

## 需要修改的内容

- **联系方式**：`src/data/site.json` 中的电话、邮箱、WhatsApp、微信目前是占位值，请替换为真实信息。
- **微信二维码**：联系页显示 `site.json` 的 `wechatQr` 图片，为空时显示占位图；在后台「站点设置 → 微信二维码」上传后发布即可。
- **域名**：`astro.config.mjs` 的 `site`（用于 canonical 与 sitemap）。

## 数据与图片

- 设备数据：`src/data/machines.json`（107 台），分类：`src/data/categories.json`。
  每条记录的 `notes` 字段记录了识别存疑之处，仅供内部核对，页面不展示。
- 图片：`public/images/`（`machines/` 产品图，`hero/`、`factory/`、`certs/`、`brand/`）。

数据和图片均由 `scripts/` 下的 Python 脚本（仅依赖 Pillow）从画册生成：

1. `extract_pages.py`：从 `画册33.pdf` 提取页面并拆分为左右半页（`scripts/work/halves/`）。
2. `crop_assets.py`：裁剪首屏、工厂、证书、Logo 与 favicon。
3. `merge_data.py`：合并 `scripts/work/data/part_*.json` 生成 `machines.json`。
   注意：`machines.json` 生成后已按画册逐条核对并手工修正（核对记录在 `scripts/work/verify/result_*.json`），重新运行此脚本会覆盖这些修正。
4. `crop_machines.py [半页编号...]`：裁剪产品图，可只重裁指定半页，例如 `py scripts\crop_machines.py 23 60`。

如需替换某台设备的图片，直接用同名文件覆盖 `public/images/machines/{id}.webp` 即可。
