import {
  ensureDirectoryParent,
  isDirectoryMarker,
  RequestHandlerParams,
} from "./utils";

// R2/S3 的 partNumber 合法范围
const MAX_PART_NUMBER = 10000;

// 缩略图保留命名空间只接受内容寻址的 <sha1hex>.png，
// 防止普通对象混入（get.ts 对该前缀下发一年的强缓存）
const THUMBNAIL_PREFIX = "_$flaredrive$/thumbnails/";

async function handleRequestPutMultipart({
  bucket,
  path,
  request,
}: RequestHandlerParams) {
  const url = new URL(request.url);

  const uploadId = new URLSearchParams(url.search).get("uploadId");
  const partNumberStr = new URLSearchParams(url.search).get("partNumber");
  if (!uploadId || !partNumberStr || !request.body)
    return new Response("Bad Request", { status: 400 });

  const partNumber = Number(partNumberStr);
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > MAX_PART_NUMBER)
    return new Response("Bad Request", { status: 400 });

  const multipartUpload = bucket.resumeMultipartUpload(path, uploadId);

  try {
    const uploadedPart = await multipartUpload.uploadPart(
      partNumber,
      request.body
    );
    return new Response(null, {
      headers: { "Content-Type": "application/json", etag: uploadedPart.etag },
    });
  } catch {
    // uploadId 不存在或分片状态非法：对客户端表现为 404（而非 500）
    return new Response("Multipart upload not found", { status: 404 });
  }
}

export async function handleRequestPut({
  bucket,
  path,
  request,
}: RequestHandlerParams) {
  const searchParams = new URLSearchParams(new URL(request.url).search);
  if (searchParams.has("uploadId")) {
    return handleRequestPutMultipart({ bucket, path, request });
  }

  if (request.url.endsWith("/")) {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "DELETE, GET, HEAD, PROPFIND" },
    });
  }

  // 目标已是目录：不允许用文件覆盖目录标记，否则子对象将永远不可见
  // （RFC 4918 §9.7.1 要求对集合 PUT 返回 405）
  const existing = await bucket.head(path);
  if (existing && isDirectoryMarker(existing)) {
    return new Response("Method Not Allowed: cannot PUT onto a collection", {
      status: 405,
      headers: { Allow: "COPY, DELETE, GET, HEAD, MKCOL, PROPFIND" },
    });
  }

  if (path.startsWith(THUMBNAIL_PREFIX)) {
    const name = path.slice(THUMBNAIL_PREFIX.length);
    if (!/^[0-9a-f]{40}\.png$/.test(name))
      return new Response("Forbidden", { status: 403 });
  } else {
    // 父级必须存在且是目录（内部保留前缀除外：缩略图目录无需标记对象）
    const parentError = await ensureDirectoryParent(bucket, path);
    if (parentError) return parentError;
  }

  const thumbnail = request.headers.get("fd-thumbnail");
  const customMetadata = thumbnail ? { thumbnail } : undefined;

  const result = await bucket.put(path, request.body, {
    onlyIf: request.headers,
    httpMetadata: request.headers,
    customMetadata,
  });

  if (!result) return new Response("Preconditions failed", { status: 412 });

  return new Response("", { status: 201 });
}
