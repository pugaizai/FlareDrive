export interface RequestHandlerParams {
  bucket: R2Bucket;
  path: string;
  request: Request;
}

export const WEBDAV_ENDPOINT = "/webdav/";

export const ROOT_OBJECT = {
  key: "",
  uploaded: new Date(),
  httpMetadata: {
    contentType: "application/x-directory",
    contentDisposition: undefined,
    contentLanguage: undefined,
  },
  customMetadata: undefined,
  size: 0,
  etag: undefined,
};

export function notFound() {
  return new Response("Not found", { status: 404 });
}

export function isDirectoryMarker(
  object: R2Object | typeof ROOT_OBJECT
): boolean {
  return object.httpMetadata?.contentType === "application/x-directory";
}

// 校验 path 的父级存在且确实是目录（而不是同名文件）。
// 只判存在不判类型时，`file.txt/child` 这类 key 能写入成功但永远不可见。
// 返回错误 Response；通过时返回 null。
export async function ensureDirectoryParent(
  bucket: R2Bucket,
  path: string
): Promise<Response | null> {
  const parentPath = path.replace(/(\/|^)[^/]*$/, "");
  const parent =
    parentPath === "" ? ROOT_OBJECT : await bucket.head(parentPath);
  if (parent === null || !isDirectoryMarker(parent))
    return new Response("Conflict", { status: 409 });
  return null;
}

// 常数时间比较，避免凭据/HMAC 校验的时序侧信道。
// Workers 提供 crypto.subtle.timingSafeEqual；其他运行时（如 Jest）降级为 XOR 比较。
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const subtle = crypto.subtle as typeof crypto.subtle & {
    timingSafeEqual?: (a: ArrayBuffer, b: ArrayBuffer) => boolean;
  };
  if (typeof subtle.timingSafeEqual === "function") {
    try {
      return subtle.timingSafeEqual(
        new TextEncoder().encode(a).buffer as ArrayBuffer,
        new TextEncoder().encode(b).buffer as ArrayBuffer
      );
    } catch {
      // 某些运行时声明了该 API 但要求 Array Buffer 视图，走降级路径
    }
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++)
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function parseBucketPath(context: any): [R2Bucket, string] {
  const { request, env, params } = context;
  const url = new URL(request.url);

  const pathSegments = (params.path || []) as String[];
  const joined = pathSegments.join("/");
  // 文件名可能含字面 `%`（如 100%.txt）。若运行时已预解码 params，二次解码会抛
  // URIError（曾导致所有方法 500）；解码失败时回退原始值。
  let path = joined;
  try {
    path = decodeURIComponent(joined);
  } catch {
    // 保持原始值
  }
  const driveid = url.hostname.replace(/\..*/, "");

  return [env[driveid] || env["BUCKET"], path];
}

export async function* listAll(
  bucket: R2Bucket,
  prefix?: string,
  isRecursive: boolean = false
) {
  let cursor: string | undefined = undefined;
  do {
    // R2ListOptions 类型（安装的 workers-types）暂无 include 字段，用交集类型声明
    var r2Objects = await bucket.list({
      prefix: prefix,
      delimiter: isRecursive ? undefined : "/",
      cursor: cursor,
      include: ["httpMetadata", "customMetadata"],
    } as R2ListOptions & {
      include: Array<"httpMetadata" | "customMetadata">;
    });

    for await (const obj of r2Objects.objects)
      if (!obj.key.startsWith("_$flaredrive$/")) yield obj;

    if (r2Objects.truncated) cursor = r2Objects.cursor;
  } while (r2Objects.truncated);
}

// 与前端 encodeKey 保持一致：按路径段 encodeURIComponent
export function encodeKeyPath(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

async function hmacSha256Hex(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// 分享 token 格式：`<expiresUnixSeconds>.<hmacHex(secret, "path:expires")>`
export async function createShareToken(
  secret: string,
  path: string,
  expires: number
) {
  return `${expires}.${await hmacSha256Hex(secret, `${path}:${expires}`)}`;
}

export async function verifyShareToken(
  secret: string,
  path: string,
  token: string
) {
  const [expiresStr, signature] = token.split(".");
  if (!expiresStr || !signature) return false;
  const expires = Number(expiresStr);
  if (!Number.isFinite(expires) || expires < Date.now() / 1000) return false;
  const expected = await hmacSha256Hex(secret, `${path}:${expiresStr}`);
  return timingSafeEqual(expected, signature);
}
