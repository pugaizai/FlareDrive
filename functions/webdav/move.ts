import { RequestHandlerParams } from "./utils";
import { handleRequestCopy } from "./copy";
import { handleRequestDelete } from "./delete";

export async function handleRequestMove({
  bucket,
  path,
  request,
}: RequestHandlerParams) {
  const copyResponse = await handleRequestCopy({ bucket, path, request });
  if (copyResponse.status >= 400) return copyResponse;

  // COPY 已成功。删除源：失败自动重试（删除是幂等的）；404 表示源已不存在，
  // 对移动来说等同于删除成功（幂等语义，重复 MOVE 不会出错）。
  for (let attempt = 0; attempt < 3; attempt++) {
    let deleteResponse: Response;
    try {
      deleteResponse = await handleRequestDelete({ bucket, path, request });
    } catch {
      // 删除过程抛错（如部分子对象删除失败），重试
      continue;
    }
    if (deleteResponse.status === 404)
      return new Response(null, { status: 204 });
    if (deleteResponse.status < 400) return deleteResponse;
  }

  // 多次重试仍失败：目标已创建但源未删干净。数据不会丢失（源仍存在），
  // 但会残留副本；整体重试 MOVE 是幂等且安全的，用 Retry-After 提示客户端稍后重试。
  return new Response(
    "Move incomplete: destination was created but the source could not be " +
      "fully deleted. Retrying the move is safe and idempotent.",
    { status: 503, headers: { "Retry-After": "5" } }
  );
}
