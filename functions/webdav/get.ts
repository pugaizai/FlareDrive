import {
  isDirectoryMarker,
  notFound,
  RequestHandlerParams,
} from "./utils";

type ResolvedRange =
  | { kind: "none" }
  | { kind: "partial"; offset: number; length: number }
  | { kind: "unsatisfiable" };

// 仅支持单区间（bytes=a-b / a- / -n）。多区间与畸形值按 RFC 7233 §3.1 忽略
// （回 200 全量）；越界区间返回 unsatisfiable（回 416）。
function parseRangeHeader(header: string | null, size: number): ResolvedRange {
  if (!header) return { kind: "none" };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return { kind: "none" };
  if (match[1] === "") {
    const suffix = Number(match[2]);
    const length = Math.min(suffix, size);
    if (suffix === 0 || length <= 0) return { kind: "unsatisfiable" };
    return { kind: "partial", offset: size - length, length };
  }
  const start = Number(match[1]);
  if (start >= size) return { kind: "unsatisfiable" };
  const end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  if (end < start) return { kind: "none" };
  return { kind: "partial", offset: start, length: end - start + 1 };
}

// RFC 7232 §2.3 弱比较：忽略 W/ 前缀，支持 * 与逗号分隔的 etag 列表
function ifNoneMatchSatisfied(header: string, httpEtag: string): boolean {
  if (header.trim() === "*") return true;
  return header
    .split(",")
    .some((candidate) => candidate.trim().replace(/^W\//, "") === httpEtag);
}

export async function handleRequestGet({
  bucket,
  path,
  request,
}: RequestHandlerParams) {
  // 先 head 取 size/etag/类型：Range 校验与 416/304 都需要元数据，
  // 代价是每次 GET 多一个子请求（远低于免费套餐的 50/请求预算）
  const meta = await bucket.head(path);
  if (meta === null) return notFound();
  // 目录标记不是可下载的文件（此前会当作 0 字节文件被下载）
  if (isDirectoryMarker(meta))
    return new Response("Method Not Allowed: cannot GET a collection", {
      status: 405,
      headers: { Allow: "COPY, DELETE, MKCOL, PROPFIND" },
    });

  const range = parseRangeHeader(request.headers.get("Range"), meta.size);
  if (range.kind === "unsatisfiable") {
    return new Response("Requested range not satisfiable", {
      status: 416,
      headers: {
        "Content-Range": `bytes */${meta.size}`,
        "Accept-Ranges": "bytes",
      },
    });
  }

  // If-None-Match 由本处理器自行评估（GET 命中应返回 304 而非 412），
  // 其余条件（如 If-Match）仍交给 R2 判定
  const onlyIf = new Headers(request.headers);
  onlyIf.delete("If-None-Match");

  const obj = await bucket.get(path, {
    onlyIf,
    ...(range.kind === "partial" ? { range } : {}),
  });
  if (obj === null) return notFound();
  if (!("body" in obj))
    return new Response("Preconditions failed", { status: 412 });

  const ifNoneMatch = request.headers.get("If-None-Match");
  if (ifNoneMatch && ifNoneMatchSatisfied(ifNoneMatch, meta.httpEtag))
    return new Response(null, {
      status: 304,
      headers: { ETag: meta.httpEtag },
    });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("Accept-Ranges", "bytes");
  headers.set("ETag", meta.httpEtag);
  headers.set("Last-Modified", meta.uploaded.toUTCString());
  if (path.startsWith("_$flaredrive$/thumbnails/"))
    headers.set("Cache-Control", "max-age=31536000");
  if (range.kind === "partial") {
    headers.set(
      "Content-Range",
      `bytes ${range.offset}-${range.offset + range.length - 1}/${meta.size}`
    );
    headers.set("Content-Length", String(range.length));
  } else {
    headers.set("Content-Length", String(meta.size));
  }

  // 分享页下载按钮：?dl=1 强制附件下载
  if (new URL(request.url).searchParams.get("dl") === "1") {
    // parseBucketPath 已解码路径，这里直接用末段即可
    const fileName = path.split("/").pop() ?? "download";
    // 响应头不允许换行/控制字符，一律替换为下划线（防响应拆分与 setHeader 抛错）
    // eslint-disable-next-line no-control-regex
    const safeName = fileName.replace(/[\x00-\x1f\x7f"\\]/g, "_");
    headers.set(
      "Content-Disposition",
      `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(
        fileName
      )}`
    );
  }

  return new Response(obj.body, {
    status: range.kind === "partial" ? 206 : 200,
    headers,
  });
}
