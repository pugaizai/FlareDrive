import { isDirectoryMarker, notFound } from "./utils";
import { listAll, RequestHandlerParams, WEBDAV_ENDPOINT } from "./utils";

// 免费套餐限制：每请求最多 50 个子请求（R2 的 head/get/put 各算 1 个）。
// 目录递归复制按"子请求预算"分批：
//   - 固定开销 3：get(src) + head(目标标记) + put(目标标记)
//   - 每个子对象：head(1) 判重；若目标已存在（上次 503 后的重试）则跳过，
//     只花 1 个子请求，保证每次调用都能向前推进；否则再 get + put（+2）
//   - 预算不足以容纳下一个操作时返回 503 + Retry-After，客户端重试继续
// 注意：把目录复制到已存在的目标目录时，目标中同名子对象会被跳过而不是覆盖
// （对单个文件复制不受影响）。这与 RFC 的完全覆盖语义有偏差，但"跳过已有"
// 是 503 断点续传能向前推进的前提，保留为文档化限制。
const MAX_SUBREQUESTS = 50;
const OVERHEAD_SUBREQUESTS = 3;

export async function handleRequestCopy({
  bucket,
  path,
  request,
}: RequestHandlerParams) {
  const overwriteHeader = request.headers.get("Overwrite");
  // RFC 4918 §10.6：Overwrite 只允许 T/F
  if (overwriteHeader !== null && overwriteHeader !== "T" && overwriteHeader !== "F")
    return new Response("Bad Request: invalid Overwrite header", { status: 400 });
  const dontOverwrite = overwriteHeader === "F";

  const destinationHeader = request.headers.get("Destination");
  if (destinationHeader === null)
    return new Response("Bad Request", { status: 400 });

  // 部分客户端发送相对路径或坏百分号编码的 Destination，此前未捕获直接 500
  let destination: string;
  try {
    const destPathname = new URL(destinationHeader, request.url).pathname;
    const decodedPathname = decodeURIComponent(destPathname).replace(/\/$/, "");
    if (!decodedPathname.startsWith(WEBDAV_ENDPOINT))
      return new Response("Bad Request", { status: 400 });
    destination = decodedPathname.slice(WEBDAV_ENDPOINT.length);
  } catch {
    return new Response("Bad Request: invalid Destination header", {
      status: 400,
    });
  }
  if (destination === "")
    return new Response("Bad Request: invalid Destination", { status: 400 });

  const src = await bucket.get(path);
  if (src === null) return notFound();
  const isDirectory = isDirectoryMarker(src);

  if (
    destination === path ||
    (isDirectory && destination.startsWith(path + "/"))
  )
    return new Response("Bad Request", { status: 400 });

  // Check if the destination already exists
  const destinationExists = await bucket.head(destination);
  if (dontOverwrite && destinationExists)
    return new Response("Precondition Failed", { status: 412 });
  // 类型混淆：文件不能覆盖目录标记（会让子对象不可见），目录也不能覆盖文件。
  // （Overwrite: F 的 head→put 之间存在极小的竞态窗口；R2 无事务能力，仅能尽力校验）
  if (destinationExists && isDirectoryMarker(destinationExists) !== isDirectory)
    return new Response(
      "Method Not Allowed: cannot overwrite a collection with a non-collection (or vice versa)",
      { status: 405 }
    );
  await bucket.put(destination, src.body, {
    httpMetadata: src.httpMetadata,
    customMetadata: src.customMetadata,
  });

  if (isDirectory) {
    const depth = request.headers.get("Depth") ?? "infinity";
    switch (depth) {
      case "0":
        break;
      case "infinity": {
        const prefix = path + "/";
        let subrequests = OVERHEAD_SUBREQUESTS;
        let hasMore = false;
        for await (const object of listAll(bucket, prefix, true)) {
          // 下一个子对象连 head 都放不下时停止（后续若还有未复制内容，客户端需重试）
          if (subrequests + 1 > MAX_SUBREQUESTS) {
            hasMore = true;
            break;
          }
          const target = `${destination}/${object.key.slice(prefix.length)}`;
          const targetExists = await bucket.head(target);
          subrequests += 1;
          // 目标已存在（上次 503 后的重试）：跳过，只消耗 1 个子请求
          if (targetExists !== null) continue;
          // 复制该子对象还需 get + put，预算不足则停止
          if (subrequests + 2 > MAX_SUBREQUESTS) {
            hasMore = true;
            break;
          }
          const child = await bucket.get(object.key);
          subrequests += 1;
          if (child === null) continue; // 列出后被并发删除：跳过，不阻塞复制
          await bucket.put(target, child.body, {
            httpMetadata: object.httpMetadata,
            customMetadata: object.customMetadata,
          });
          subrequests += 1;
        }
        if (hasMore) {
          return new Response(
            "Directory still contains children; retry the COPY to continue",
            { status: 503, headers: { "Retry-After": "5" } }
          );
        }
        break;
      }
      default:
        return new Response("Bad Request", { status: 400 });
    }
  }

  if (destinationExists) {
    return new Response(null, { status: 204 });
  } else {
    return new Response("", { status: 201 });
  }
}
