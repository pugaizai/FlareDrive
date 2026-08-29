import {
  createShareToken,
  encodeKeyPath,
  notFound,
  parseBucketPath,
  resolveShareTtl,
  timingSafeEqual,
  verifyShareToken,
} from "./utils";
import { handleRequestCopy } from "./copy";
import { handleRequestDelete } from "./delete";
import { handleRequestGet } from "./get";
import { handleRequestHead } from "./head";
import { handleRequestMkcol } from "./mkcol";
import { handleRequestMove } from "./move";
import { handleRequestPropfind } from "./propfind";
import { handleRequestPut } from "./put";
import { RequestHandlerParams } from "./utils";
import { handleRequestPost } from "./post";
import { handleRequestSharePage } from "./share";

async function handleRequestOptions() {
  return new Response(null, {
    headers: {
      Allow: Object.keys(HANDLERS).join(", "),
      DAV: "1",
    },
  });
}

async function handleMethodNotAllowed() {
  // RFC 7231 §6.4.5：405 必须携带 Allow 头
  return new Response(null, {
    status: 405,
    headers: { Allow: Object.keys(HANDLERS).join(", ") },
  });
}

// UTF-8 安全的 Base64（Workers 的 btoa 只支持 Latin-1）
function toBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

const HANDLERS: Record<
  string,
  (context: RequestHandlerParams) => Promise<Response>
> = {
  PROPFIND: handleRequestPropfind,
  MKCOL: handleRequestMkcol,
  HEAD: handleRequestHead,
  GET: handleRequestGet,
  POST: handleRequestPost,
  PUT: handleRequestPut,
  COPY: handleRequestCopy,
  MOVE: handleRequestMove,
  DELETE: handleRequestDelete,
};

export const onRequest: PagesFunction<{
  WEBDAV_USERNAME: string;
  WEBDAV_PASSWORD: string;
  WEBDAV_PUBLIC_READ?: string;
  WEBDAV_SHARE_SECRET?: string;
  // 分享链接默认有效期（秒），钳制在 1 小时 ~ 30 天；分享时可通过 ?ttl= 自选
  WEBDAV_SHARE_TTL?: string;
}> = async function (context) {
  const env = context.env;
  const request: Request = context.request;
  if (request.method === "OPTIONS") return handleRequestOptions();

  const [bucket, path] = parseBucketPath(context);
  if (!bucket) return notFound();

  const searchParams = new URL(request.url).searchParams;
  const shareSecret = env.WEBDAV_SHARE_SECRET;
  const isShareRequest =
    searchParams.has("share") && ["GET", "HEAD"].includes(request.method);

  // 有效的分享 token（?token=<expires>.<hmac>）对 GET/HEAD 免认证
  const token = searchParams.get("token");
  const tokenValid =
    !!token &&
    !!shareSecret &&
    ["GET", "HEAD"].includes(request.method) &&
    (await verifyShareToken(shareSecret, path, token));

  const skipAuth =
    tokenValid ||
    (env.WEBDAV_PUBLIC_READ === "1" &&
      ["GET", "HEAD", "PROPFIND"].includes(request.method));

  if (!skipAuth) {
    if (!env.WEBDAV_USERNAME || !env.WEBDAV_PASSWORD)
      return new Response("WebDAV protocol is not enabled", { status: 403 });

    // 网页端请求（带 X-FlareDrive-Web 标记）的 401 不下发 WWW-Authenticate，
    // 避免浏览器对 fetch 弹原生登录框；WebDAV 客户端仍收到质询以弹出账号输入。
    const isWebApp = request.headers.get("X-FlareDrive-Web") === "1";
    const challengeHeaders: Record<string, string> = isWebApp
      ? {}
      : { "WWW-Authenticate": `Basic realm="WebDAV"` };

    const auth = request.headers.get("Authorization");
    if (!auth) {
      return new Response("Unauthorized", {
        status: 401,
        headers: challengeHeaders,
      });
    }
    // UTF-8 安全的 Base64：与前端 createAuthHeaders 保持一致，
    // 否则用户名/密码含非 ASCII 字符时 btoa 会直接抛异常
    const expectedAuth = `Basic ${toBase64(
      `${env.WEBDAV_USERNAME}:${env.WEBDAV_PASSWORD}`
    )}`;
    // 常数时间比较，避免逐字节短路造成的时序侧信道
    if (!timingSafeEqual(auth, expectedAuth))
      return new Response("Unauthorized", {
        status: 401,
        headers: challengeHeaders,
      });
  }

  // 生成短时效签名分享链接（需要已认证）
  if (isShareRequest) {
    if (!shareSecret)
      return new Response(
        "Share links are not enabled: set WEBDAV_SHARE_SECRET",
        { status: 503 }
      );
    // 有效期可选 ?ttl=<秒>（钳制 1 小时 ~ 30 天）；缺省用 WEBDAV_SHARE_TTL 默认值
    const ttl = resolveShareTtl(env.WEBDAV_SHARE_TTL, searchParams.get("ttl"));
    if (ttl === null)
      return new Response(
        "Invalid ttl: positive number of seconds between 3600 and 2592000",
        { status: 400 }
      );
    const expires = Math.floor(Date.now() / 1000) + ttl;
    const token = await createShareToken(shareSecret, path, expires);
    const origin = new URL(request.url).origin;
    const shareUrl = `${origin}/webdav/${encodeKeyPath(path)}?token=${token}`;
    return new Response(JSON.stringify({ url: shareUrl }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // 分享链接预览页：浏览器导航（Accept: text/html）且 token 有效时渲染下载页；
  // ?dl=1 直接强制附件下载（走 get.ts）；非 HTML 客户端保持原始字节（API 兼容）。
  const wantsDownload = searchParams.get("dl") === "1";
  const acceptsHtml = request.headers.get("Accept")?.includes("text/html") ?? false;
  if (request.method === "GET" && tokenValid && !wantsDownload && acceptsHtml) {
    return handleRequestSharePage({ bucket, path, request });
  }

  const method: string = (context.request as Request).method;
  // 空路径（/webdav/）只对 PROPFIND（列根目录）与 DELETE（递归清空）有意义；
  // 其余方法此前会把空 key 传给 R2 导致未捕获异常（500）
  if (
    path === "" &&
    !["PROPFIND", "DELETE"].includes(method)
  )
    return new Response("Bad Request: resource path required", { status: 400 });
  const handler = HANDLERS[method] ?? handleMethodNotAllowed;
  return handler({ bucket, path, request: context.request });
};
