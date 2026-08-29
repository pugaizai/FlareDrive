# FlareDrive

[![CI](https://github.com/pugaizai/FlareDrive/actions/workflows/ci.yml/badge.svg)](https://github.com/pugaizai/FlareDrive/actions/workflows/ci.yml)

> 中文版请见 [README_ZH-CN.md](./README_ZH-CN.md) · For Chinese, see [README_ZH-CN.md](./README_ZH-CN.md)

A zero-server cloud drive built on **Cloudflare R2 + Pages Functions**: a web file manager plus standard WebDAV endpoints ([free tier](https://developers.cloudflare.com/r2/platform/pricing/): 10 GB storage, 100k requests/day).

## Features

- **File management**: hash-route browsing, search, sort, grid/list views, box selection, create / rename (no silent overwrite) / copy / move / delete (batched with retries)
- **Upload**: drag-and-drop and folder upload, photos/videos, TextPad notes, ≥100 MB chunked upload (auto-retry and cleanup on failure)
- **Thumbnails** (images/MP4/PDF, SHA-1 dedup), **HMAC share links** (24h by default, preview/download without an account), **multi-tenant** subdomain isolation, CI + 80+ tests
- **i18n**: English, Simplified Chinese and Traditional Chinese built in; auto-detected from the browser language, switchable anytime from the header menu (your choice is remembered)

## Deployment

Prerequisites: a Cloudflare account (with R2 enabled) and at least one bucket.

**Pages dashboard (Git integration)**: Fork and connect Pages → add the environment variables from the table below under "Variables and secrets" (`WEBDAV_USERNAME` / `WEBDAV_PASSWORD` / `WEBDAV_SHARE_SECRET` as **secrets**, `WEBDAV_SHARE_TTL` as **text**) → add the R2 bucket binding `BUCKET` under "Bindings" → after the first deploy, retry the deployment from Deployments to apply the settings if needed.

## Environment variables & bindings

Configure as follows (Cloudflare Pages dashboard → Settings):

**Variables and secrets**

| Type | Name | Value |
| --- | --- | --- |
| Secret | `WEBDAV_USERNAME` | Login username |
| Secret | `WEBDAV_PASSWORD` | Login password |
| Secret | `WEBDAV_SHARE_SECRET` | Share signing secret |
| Text | `WEBDAV_SHARE_TTL` | `86400` (optional) |

**Bindings**

| Type | Name | Value |
| --- | --- | --- |
| R2 bucket | `BUCKET` | Your R2 bucket name |

- The first three use the "secret" (encrypted) type and are stored encrypted in the dashboard; `WEBDAV_SHARE_TTL` is plain text and optional — the default share validity in seconds, clamped to 1h–30d (share links can never be permanent; the web UI lets you pick 1h–30d per share)
- **Leave `WEBDAV_PUBLIC_READ` unset (recommended — keep it private)**: `GET` / `HEAD` / `PROPFIND` all require authentication, so both the web UI and WebDAV clients must log in; use `WEBDAV_SHARE_SECRET` signed links for sharing instead — no public read needed
- **If `WEBDAV_PUBLIC_READ=1`**: `GET` / `HEAD` / `PROPFIND` skip authentication — **anyone can browse/download files without an account, and PROPFIND exposes the whole directory structure (all files and folders can be enumerated)**; write operations (PUT/DELETE/MOVE/COPY/MKCOL/POST) still require authentication

## WebDAV & sharing

- Mount: `https://<domain>/webdav`, credentials are `WEBDAV_USERNAME` / `WEBDAV_PASSWORD`; ⚠️ uploads ≥100 MB are not supported (large files should use the web UI's chunked upload)
- Share: select a file → Share → `.../webdav/<file>?token=<signed>`, recipients can preview/download without an account; the link expires when the token does

## Cloudflare R2 free tier notes

Each request has a **50 subrequest budget**: directory deletes (≤40 objects per call) and recursive copies (≤15 per call) run in batches; exceeding it returns `503 + Retry-After` and the client retries until completion (operations are idempotent). R2 I/O (`await`) does not count toward CPU time.

Acknowledgements: the WebDAV code is based on [r2-webdav](https://github.com/abersheeran/r2-webdav)
