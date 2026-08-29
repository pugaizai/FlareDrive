import { ensureDirectoryParent, RequestHandlerParams } from "./utils";

export async function handleRequestMkcol({
  bucket,
  path,
  request,
}: RequestHandlerParams) {
  // RFC 4918 §9.3.1：MKCOL 请求体一律 415（部分客户端会附带 XML body）
  if (request.body)
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
