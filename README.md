# FlareDrive

[![CI](https://github.com/pugaizai/FlareDrive/actions/workflows/ci.yml/badge.svg)](https://github.com/pugaizai/FlareDrive/actions/workflows/ci.yml)

基于 **Cloudflare R2 + Pages Functions** 的零服务器网盘：网页端文件管理 + 标准 WebDAV 端点
（[免费套餐](https://developers.cloudflare.com/r2/platform/pricing/) 10 GB 存储、每天 10 万次请求）。

## 功能

- **文件管理**：hash 路由浏览、搜索、排序、网格/列表视图、框选多选、新建/重命名（防覆盖）/复制/移动/删除（分批重试）
- **上传**：拖拽与文件夹上传、图片/视频、TextPad 记事本、≥100MB 分块上传（失败自动重试与清理）
- **缩略图**（图片/MP4/PDF，SHA-1 去重）、**HMAC 分享链接**（默认 24h、免账号预览/下载）、**多租户**子域隔离、CI + 80+ 测试
- **多语言**：内置英语 / 简体中文 / 繁体中文，浏览器语言自动识别，顶栏菜单可随时切换并记住选择

## 部署

前置条件：Cloudflare 账号（已开通 R2）并创建至少一个 bucket。

**Pages 控制台（Git 集成）**：Fork 并连接 Pages → 在"变量和密钥"添加下表的环境变量（`WEBDAV_USERNAME`/`WEBDAV_PASSWORD`/`WEBDAV_SHARE_SECRET` 用**密钥**加密类型，`WEBDAV_SHARE_TTL` 用**文本**）→ 在"绑定"添加 R2 存储桶 `BUCKET` → 首次部署后在 Deployments 重试生效。

## 环境变量与绑定

按以下配置（Cloudflare Pages 控制台 → 设置）：

**变量和密钥**

| 类型 | 名称 | 值 |
| --- | --- | --- |
| 密钥 | `WEBDAV_USERNAME` | 登录用户名 |
| 密钥 | `WEBDAV_PASSWORD` | 登录密码 |
| 密钥 | `WEBDAV_SHARE_SECRET` | 分享签名密钥 |
| 文本 | `WEBDAV_SHARE_TTL` | `86400` |

**绑定**

| 类型 | 名称 | 值 |
| --- | --- | --- |
| R2 存储桶 | `BUCKET` | 你的 R2 桶名 |

- 前三项用"密钥"（加密）类型，值在控制台加密存储；`WEBDAV_SHARE_TTL` 为普通文本，默认 `86400`（24h）
- **不设置 `WEBDAV_PUBLIC_READ`（推荐，保持私有）**：`GET`/`HEAD`/`PROPFIND` 均需认证，网页端与 WebDAV 客户端都要登录；分享用 `WEBDAV_SHARE_SECRET` 签名链接即可，无需公开读
- **若设 `WEBDAV_PUBLIC_READ=1`**：`GET`/`HEAD`/`PROPFIND` 免认证——**任何人无需账号即可浏览/下载文件，且 PROPFIND 会公开整个目录结构（所有文件与文件夹可被枚举）**；写入操作（PUT/DELETE/MOVE/COPY/MKCOL/POST）仍需认证

## WebDAV 与分享

- 挂载：`https://<域名>/webdav`，凭据即 `WEBDAV_USERNAME` / `WEBDAV_PASSWORD`；⚠️ 不支持 ≥100MB 上传（大文件走网页端分块）
- 分享：选中文件 → Share → `.../webdav/<文件>?token=<签名>`，接收方免账号预览/下载，token 过期即失效

## Cloudflare R2 免费套餐注意

每请求 **50 个子请求**：目录删除（每次 ≤40 个对象）与递归复制（每次 ≤15 个）按批执行，超出返回 `503 + Retry-After`，客户端重试直至完成（操作幂等）。R2 的 I/O（await）不计入 CPU 时间。

致谢：WebDAV 代码基于 [r2-webdav](https://github.com/abersheeran/r2-webdav)
