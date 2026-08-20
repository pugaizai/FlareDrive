// 分享链接预览页：token 有效且浏览器导航（Accept: text/html）时渲染下载页，
// 接收方无需任何凭据即可查看文件名/大小并下载。
import { RequestHandlerParams, encodeKeyPath } from "./utils";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function humanReadableSize(size: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let value = size;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}

export async function handleRequestSharePage({
  bucket,
  path,
  request,
}: RequestHandlerParams) {
  const obj = await bucket.head(path);
  if (obj === null) return new Response("Not found", { status: 404 });

  const fileName = path.split("/").pop() ?? "";
  const contentType = obj.httpMetadata?.contentType ?? "application/octet-stream";
  const size = obj.size;

  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  // 预览（img/video 标签会带 Accept: */* 而非 text/html，自动落到原始字节服务）
  const mediaUrl = `${url.origin}/webdav/${encodeKeyPath(path)}?token=${encodeURIComponent(token)}`;
  const downloadUrl = `${mediaUrl}&dl=1`;

  const isImage = contentType.startsWith("image/");
  const isVideo = contentType.startsWith("video/");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(fileName)} — FlareDrive</title>
<style>
  body { margin:0; font-family: system-ui, -apple-system, sans-serif; background:#f6f6f4; color:#1f2328; display:flex; justify-content:center; padding:48px 16px; }
  .card { background:#fff; border:1px solid #e0e0e0; border-radius:12px; padding:32px; max-width:480px; width:100%; text-align:center; box-sizing:border-box; }
  .preview { max-width:100%; max-height:320px; border-radius:8px; margin-bottom:16px; }
  h1 { font-size:18px; margin:0 0 8px; word-break:break-all; }
  .meta { color:#656d76; font-size:14px; margin:0 0 24px; word-break:break-all; }
  .download { display:inline-block; background:#f38020; color:#fff; text-decoration:none; padding:10px 28px; border-radius:8px; font-weight:600; }
  .download:hover { filter:brightness(0.95); }
</style>
</head>
<body>
<div class="card">
  ${isImage ? `<img class="preview" src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(fileName)}">` : ""}
  ${isVideo ? `<video class="preview" controls src="${escapeHtml(mediaUrl)}"></video>` : ""}
  <h1>${escapeHtml(fileName)}</h1>
  <p class="meta">${escapeHtml(contentType)} · ${escapeHtml(humanReadableSize(size))}</p>
  <a class="download" href="${escapeHtml(downloadUrl)}">Download</a>
</div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
