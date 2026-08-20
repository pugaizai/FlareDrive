import { notFound } from "./utils";
import { RequestHandlerParams } from "./utils";

export async function handleRequestGet({
  bucket,
  path,
  request,
}: RequestHandlerParams) {
  const obj = await bucket.get(path, {
    onlyIf: request.headers,
    range: request.headers,
  });
  if (obj === null) return notFound();
  if (!("body" in obj))
    return new Response("Preconditions failed", { status: 412 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  if (path.startsWith("_$flaredrive$/thumbnails/"))
    headers.set("Cache-Control", "max-age=31536000");

  // 分享页下载按钮：?dl=1 强制附件下载
  if (new URL(request.url).searchParams.get("dl") === "1") {
    // parseBucketPath 已解码路径，这里直接用末段即可
    const fileName = path.split("/").pop() ?? "download";
    const safeName = fileName.replace(/["\\]/g, "_");
    headers.set(
      "Content-Disposition",
      `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(
        fileName
      )}`
    );
  }

  return new Response(obj.body, { headers });
}
