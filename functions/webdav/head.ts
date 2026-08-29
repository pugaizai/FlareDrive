import { isDirectoryMarker, notFound, RequestHandlerParams } from "./utils";

export async function handleRequestHead({
  bucket,
  path,
}: RequestHandlerParams) {
  const obj = await bucket.head(path);
  if (obj === null) return notFound();
  // 目录标记不是文件（此前 HEAD 会报出 0 字节大小，误导按大小做同步的客户端）
  if (isDirectoryMarker(obj))
    return new Response(null, {
      status: 405,
      headers: { Allow: "COPY, DELETE, MKCOL, PROPFIND" },
    });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("Accept-Ranges", "bytes");
  headers.set("ETag", obj.httpEtag);
  headers.set("Last-Modified", obj.uploaded.toUTCString());
  headers.set("Content-Length", String(obj.size));
  return new Response(null, { headers });
}
