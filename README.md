# FlareDrive

[![CI](https://github.com/pugaizai/FlareDrive/actions/workflows/ci.yml/badge.svg)](https://github.com/pugaizai/FlareDrive/actions/workflows/ci.yml)

基于 **Cloudflare R2 + Pages Functions** 的网盘：网页端 + 标准 WebDAV 端点，零服务器成本。
免费套餐包含 10 GB 存储、每天 100,000 次请求调用。
[更多定价信息](https://developers.cloudflare.com/r2/platform/pricing/)

## 功能特性

- **文件管理**：浏览（支持 URL hash 路由，刷新不丢路径）、搜索、新建/重命名（防覆盖）/复制/移动/删除（适配免费套餐分批）
- **上传**：拖拽上传、文件夹上传（选择器 + 拖拽目录树）、图片/视频、TextPad 快速记事本、大文件分块上传（≥100MB，断点失败自动重试与清理）
- **缩略图**：图片 / MP4 / PDF 自动生成，SHA-1 去重、长期缓存
- **分享链接**：HMAC 签名、短时效（默认 24h）、接收方免账号下载/预览，无需开启公开读
- **WebDAV 端点**：可用任意 WebDAV 客户端挂载
- **多租户**：子域名隔离存储桶（`<driveid>.example.com` → 对应 R2 桶）
- **工程化**：GitHub Actions CI（lint / 类型检查 / 测试带覆盖率 / 构建）、46 个单元与组件测试

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + TypeScript + MUI 5（Create React App） |
| 后端 | Cloudflare Pages Functions（零服务器） |
| 存储 | Cloudflare R2（S3 兼容，绑定为 `BUCKET`） |
| 认证 | WebDAV Basic Auth（网页端凭据存 localStorage，401 自动弹窗登录） |

## 快速开始

### 前置条件

- 已注册 [Cloudflare](https://dash.cloudflare.com/) 账号并添加付款方式
- 已开通 R2 服务并创建至少一个 bucket

### 方式一：Pages 控制台（Git 集成）

1. Fork 本项目并连接到 Cloudflare Pages
   - 框架预设选择 **Docusaurus**
   - 在控制台添加环境变量：`WEBDAV_USERNAME`、`WEBDAV_PASSWORD`（建议用"加密"类型，即 secret）
2. 首次部署后，在 Pages 绑定 R2 bucket 为 `BUCKET`
3. 在 Deployments 页面重试部署以生效
4. （可选）添加自定义域名

> ⚠️ Git 集成部署**不会读取** `wrangler.toml`，环境变量需在控制台配置。

### 方式二：Wrangler CLI

```bash
npm install
npm run build
npx wrangler pages deploy build
```

CLI 部署会读取 `wrangler.toml`（项目名、R2 绑定、`[vars]`）。

## 环境变量

| 变量 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `WEBDAV_USERNAME` | 🔒 机密 | ✅ | 登录用户名。**缺失时服务端返回 403，所有功能不可用** |
| `WEBDAV_PASSWORD` | 🔒 机密 | ✅ | 登录密码 |
| `WEBDAV_SHARE_SECRET` | 🔒 机密 | 可选 | 分享链接签名密钥（随机长字符串）。未设置时分享功能关闭 |
| `WEBDAV_PUBLIC_READ` | 普通变量 | 可选 | 设为 `1` 开启公开读：`GET`/`HEAD`/`PROPFIND` 免认证（**注意：目录列表也会公开可枚举**） |
| `WEBDAV_SHARE_TTL` | 普通变量 | 可选 | 分享链接有效期（秒），默认 `86400`（24 小时） |

> 🔒 **机密项不要写入 `wrangler.toml` 的 `[vars]` 或提交到仓库！**
> 生产环境用 Pages 控制台"环境变量 → 加密"配置，或命令行：
> ```bash
> npx wrangler pages secret put WEBDAV_USERNAME
> npx wrangler pages secret put WEBDAV_PASSWORD
> npx wrangler pages secret put WEBDAV_SHARE_SECRET
> ```
> 服务端通过 `env.<名称>` 读取，与普通变量用法一致。

### 推荐配置：用分享、不开公开读

```bash
# 1. 配置机密（secret）——必填前两个，第三个启用分享链接
npx wrangler pages secret put WEBDAV_USERNAME
npx wrangler pages secret put WEBDAV_PASSWORD
npx wrangler pages secret put WEBDAV_SHARE_SECRET   # 用随机长字符串

# 2. 不设置 WEBDAV_PUBLIC_READ —— 保持私有
# 3. （可选）普通变量：npx wrangler pages var put WEBDAV_SHARE_TTL 86400
```

- 网页端与 WebDAV 全部需要登录；
- 分享按钮生成单个文件的签名链接，接收方无需账号即可下载/预览，到期自动失效。

## 本地开发

```bash
npm install
npm start                      # 前端开发服务器（无后端功能）
```

联调 WebDAV 后端（需要本机已装 wrangler，且可访问你的 R2 bucket）：

```bash
cp .dev.vars.example .dev.vars # 填入本地凭据（.dev.vars 已被 gitignore）
npm run build
npx wrangler pages dev build
```

## CI 与自动部署

推送到 `main`（或提交 PR）会自动运行：`eslint` → `tsc --noEmit` → 测试（带覆盖率）→ 生产构建。

启用 CI 自动部署到 Pages：
1. 创建 Pages 项目：`npx wrangler pages project create flaredrive --production-branch main`
2. 在仓库 Settings → Secrets 添加 `CLOUDFLARE_API_TOKEN`（Pages 编辑权限）与 `CLOUDFLARE_ACCOUNT_ID`
3. 在控制台配置 `WEBDAV_*` 凭据

未配置凭据时部署 job 自动跳过，不影响其他 CI 步骤。

## 分享链接

- 网页端选中单个文件 → 工具栏 Share 按钮 → 生成 `https://<域名>/webdav/<文件>?token=<签名>`
- 接收方打开链接：浏览器显示**预览/下载页**（文件名、大小、图片/视频内联预览、Download 按钮），API/curl 直接返回原始字节
- token 为 HMAC 签名（`<过期时间>.<签名>`），仅对该文件有效，过期即失效；无需开启公开读

## WebDAV 端点

任意支持 WebDAV 的客户端（如 [Cx File Explorer](https://play.google.com/store/apps/details?id=com.cxinventor.file.explorer)、[BD File Manager](https://play.google.com/store/apps/details?id=com.liuzho.file.explorer)）可挂载：

- 端点地址：`https://<your-domain.com>/webdav`
- 用户名/密码：即 `WEBDAV_USERNAME` / `WEBDAV_PASSWORD`

> ⚠️ 标准 WebDAV 协议受 Cloudflare Workers 请求体限制，**不支持 ≥100MB 上传**；
> 大文件请通过网页端上传（支持分块）。

## 免费套餐注意事项

- 每请求 **50 个子请求**预算：目录删除按批执行（单次最多 40 个对象），超出返回 `503 + Retry-After`，客户端重试直至完成（删除幂等，重复调用安全）
- 每请求 CPU 10ms：R2 的 I/O（await）不计入 CPU，因此文件操作本身不受影响

## 测试

```bash
npm test -- --watchAll=false   # 运行全部测试
npm test -- --watchAll=false --coverage   # 带覆盖率
```

覆盖：上传队列（重试/死锁回归）、multipart 分块与清理、PROPFIND XML 转义、分享 token 签名/校验/预览页、WebDAV COPY/MOVE/DELETE 语义、认证流程、前端组件（登录弹窗、进度面板）。

## 项目结构

```
├── src/                    # 前端（React + MUI）
│   ├── app/                #   WebDAV 客户端、上传队列、认证、文件夹上传
│   └── __tests__/          #   测试
├── functions/webdav/       # Pages Functions —— WebDAV 服务端（9 个方法 handler + 分享）
├── public/                 # 静态资源 / PWA
├── wrangler.toml           # Pages 部署配置（R2 绑定、compatibility_date）
├── .dev.vars.example       # 本地开发凭据模板
└── .github/workflows/ci.yml # CI（lint/tsc/test/build + 可选自动部署）
```

## 致谢

WebDAV 相关代码基于 [r2-webdav](https://github.com/abersheeran/r2-webdav)（作者 [abersheeran](https://github.com/abersheeran)）。
