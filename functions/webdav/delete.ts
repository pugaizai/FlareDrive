import pLimit from "p-limit";

import { listAll, RequestHandlerParams } from "./utils";

// 免费套餐限制：每请求最多 50 个子请求（R2 的 head/list/delete 各算 1 个），
// 且 CPU 时间 10ms（await R2 的 I/O 不计入 CPU）。因此单次调用内最多处理
// 1(head) + 1(标记删除) + 1(list) + 40(删除) = 43 个，超出后分批重试。
const MAX_DELETES_PER_CALL = 40;

export async function handleRequestDelete({
  bucket,
  path,
  request,
}: RequestHandlerParams) {
  // S3 兼容语义：带 uploadId 的 DELETE 用于中止未完成的 multipart 上传，
  // 清理已上传的分块，而不是删除对象本身。
  const uploadId = new URL(request.url).searchParams.get("uploadId");
  if (uploadId) {
    await bucket.resumeMultipartUpload(path, uploadId).abort();
    return new Response(null, { status: 204 });
  }

  // 文件：删掉标记即完成；目录标记若已不存在（上次未删完）也继续清理子对象。
  if (path !== "") {
    const obj = await bucket.head(path);
    if (obj !== null) {
      await bucket.delete(path);
      if (obj.httpMetadata?.contentType !== "application/x-directory")
        return new Response(null, { status: 204 });
    }
  }

  // 递归列出全部后代（含嵌套目录标记与文件），逐批删除。
  // 分批：免费套餐单次调用子请求预算 50，超出部分返回 503 + Retry-After，
  // 客户端重试 DELETE 直到 204（删除幂等，重复调用安全）。
  const children = listAll(
    bucket,
    path === "" ? undefined : `${path}/`,
    true
  );
  const limit = pLimit(10);
  const batch: Promise<void>[] = [];
  let deleted = 0;
  let hasMore = false;
  for await (const child of children) {
    if (deleted >= MAX_DELETES_PER_CALL) {
      hasMore = true;
      break;
    }
    batch.push(limit(() => bucket.delete(child.key).then(() => undefined)));
    deleted++;
  }
  await Promise.all(batch);

  if (hasMore) {
    return new Response(
      "Directory still contains children; retry the DELETE to continue",
      { status: 503, headers: { "Retry-After": "5" } }
    );
  }
  return new Response(null, { status: 204 });
}
