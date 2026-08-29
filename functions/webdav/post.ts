import { ensureDirectoryParent, notFound } from "./utils";
import { RequestHandlerParams } from "./utils";

export async function handleRequestPostCreateMultipart({
  bucket,
  path,
  request,
}: RequestHandlerParams) {
  // 与 PUT 相同的父级校验：防止在无目录标记、或以文件为父的路径下
  // 创建分片上传，完成后产生永远不可见的对象
  if (!path.startsWith("_$flaredrive$/")) {
    const parentError = await ensureDirectoryParent(bucket, path);
    if (parentError) return parentError;
  }

  const thumbnail = request.headers.get("fd-thumbnail");
  const customMetadata = thumbnail ? { thumbnail } : undefined;

  const multipartUpload = await bucket.createMultipartUpload(path, {
    httpMetadata: request.headers,
    customMetadata,
  });

  const { key, uploadId } = multipartUpload;
  return new Response(JSON.stringify({ key, uploadId }));
}

export async function handleRequestPostCompleteMultipart({
  bucket,
  path,
  request,
}: RequestHandlerParams) {
  const url = new URL(request.url);
  const uploadId = new URLSearchParams(url.search).get("uploadId");
  if (!uploadId) return notFound();
  const multipartUpload = bucket.resumeMultipartUpload(path, uploadId);

  let completeBody: { parts: Array<any> };
  try {
    completeBody = await request.json();
  } catch {
    return new Response("Bad Request: invalid JSON body", { status: 400 });
  }
  if (
    !completeBody ||
    !Array.isArray(completeBody.parts) ||
    completeBody.parts.some(
      (part) =>
        !part ||
        !Number.isInteger(part.partNumber) ||
        typeof part.etag !== "string"
    )
  )
    return new Response("Bad Request: invalid parts", { status: 400 });

  try {
    const object = await multipartUpload.complete(completeBody.parts);
    return new Response(null, {
      headers: { etag: object.httpEtag },
    });
  } catch {
    // 不向客户端透传 R2 的内部错误消息；常见原因是 uploadId 失效或分片清单不完整
    return new Response("Bad Request: failed to complete multipart upload", {
      status: 400,
    });
  }
}

export const handleRequestPost = async function ({
  bucket,
  path,
  request,
}: RequestHandlerParams) {
  const url = new URL(request.url);
  const searchParams = new URLSearchParams(url.search);

  if (searchParams.has("uploads")) {
    return handleRequestPostCreateMultipart({ bucket, path, request });
  }

  if (searchParams.has("uploadId")) {
    return handleRequestPostCompleteMultipart({ bucket, path, request });
  }

  return new Response("Method not allowed", { status: 405 });
};
