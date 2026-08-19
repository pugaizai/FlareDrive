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

  const deleteResponse = await handleRequestDelete({ bucket, path, request });
  if (deleteResponse.status >= 400) {
    // COPY 已成功但源未被完整删除：数据不会丢失（源仍然存在），
    // 但目标处会残留一份副本，移动处于半完成状态，需明确告知客户端。
    return new Response(
      "Move incomplete: destination was created but the source could not be " +
        "fully deleted. No data was lost, but the source still exists.",
      { status: 500 }
    );
  }
  return deleteResponse;
}
