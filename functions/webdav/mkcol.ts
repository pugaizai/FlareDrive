import { ensureDirectoryParent, RequestHandlerParams } from "./utils";

export async function handleRequestMkcol({
  bucket,
  path,
  request,
}: RequestHandlerParams) {
  // RFC 4918 §9.3.1：MKCOL 携带非空请求体一律 415（部分客户端会附带 XML body）
  // 不能只判 request.body 是否为 null：无数据的 MKCOL 也常带 Content-Length: 0
  // （Dart HttpClient 等），Workers 对此返回非 null 的空流，须按实际字节判断
  const body = await request.arrayBuffer();
  if (body.byteLength > 0)
    return new Response("Unsupported Media Type", { status: 415 });

  // Check if the resource already exists
  const resource = await bucket.head(path);
  if (resource !== null) {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // 父级必须存在且确实是目录（只判存在时，可在一个文件下创建不可见的子目录）
  const parentError = await ensureDirectoryParent(bucket, path);
  if (parentError) return parentError;

  await bucket.put(path, "", {
    httpMetadata: { contentType: "application/x-directory" },
  });

  return new Response("Created", { status: 201 });
}
