# 展示站与画册数据整理

## 业务目标

面向国内外包装机械采购客户，提供中英双语产品目录，支持查找设备、阅读参数、比较机型和联系厂家咨询报价。以下内容根据当前源码整理，文档更新时间不代表各功能的原始完成时间。

## 数据处理流程

1. qingjin-site/scripts/extract_pages.py 提取画册页面。
2. qingjin-site/scripts/crop_assets.py 裁剪品牌、工厂和证书素材。
3. qingjin-site/scripts/crop_machines.py 裁剪设备图片。
4. qingjin-site/scripts/merge_data.py 合并分段转录数据。
5. 合并后的人工核对问题见 [画册问题清单](../../../qingjin-site/画册问题清单.md)。重新合并前应比较结果，避免覆盖人工修正。

当前静态数据包含 107 台设备、8 个分类。原始 PDF 和 scripts/work 中间资料不随源码分发；展示站运行所需的数据和静态图片已纳入仓库。

## 页面与组件

| 页面 | 职责 | 仓库内源码 |
| --- | --- | --- |
| 双语首页 | 品牌、推荐机型、工厂资料 | qingjin-site/src/pages/[lang]/index.astro |
| 产品中心 | 分类筛选、型号搜索 | qingjin-site/src/pages/[lang]/products/index.astro |
| 产品详情 | 设备图片与参数 | qingjin-site/src/pages/[lang]/products/[id].astro |
| 对比页面 | 最多 4 台机型参数对比 | qingjin-site/src/pages/[lang]/compare/index.astro |
| 关于页面 | 工厂照片与证书 | qingjin-site/src/pages/[lang]/about/index.astro |
| 联系页面 | 电话、邮件、WhatsApp、微信及机型提示 | qingjin-site/src/pages/[lang]/contact/index.astro |

qingjin-site/src/utils/index.ts 读取静态 JSON，计算目录数量，兼容历史推荐列表和后台导出的推荐标记。实际依赖版本以 package.json 和锁文件为准。

## 使用边界与验证

当前联系页没有在线询盘表单；URL 中的 model 参数用于显示咨询机型，不代表创建订单。仓库配置仍有占位联系方式，上线前需填写真实信息并逐一验证。

本会话此前已通过展示站检查与构建，生成 226 个页面。本次文档更新不代表重新处理了画册，也不代表真实销售渠道已验收。后续应检查双语页面、搜索、对比限制与联系链接。
