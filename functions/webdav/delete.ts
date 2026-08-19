import pLimit from "p-limit";

import { notFound } from "./utils";
import { listAll, RequestHandlerParams } from "./utils";

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

  if (path !== "") {
    const obj = await bucket.head(path);
    if (obj === null) return notFound();
    await bucket.delete(path);
    if (obj.httpMetadata?.contentType !== "application/x-directory")
      return new Response(null, { status: 204 });
  }

  // 子对象并发删除（R2 无批量删除 API），避免大目录串行过慢。
  // 注意：单次函数调用的 CPU/请求预算有限，超大目录建议分批或走队列。
  const children = listAll(bucket, path === "" ? undefined : `${path}/`);
  const limit = pLimit(10);
  const promises: Promise<void>[] = [];
  for await (const child of children) {
    promises.push(limit(() => bucket.delete(child.key).then(() => undefined)));
  }
  await Promise.all(promises);

  return new Response(null, { status: 204 });
}
