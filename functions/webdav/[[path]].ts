import {
  createShareToken,
  encodeKeyPath,
  notFound,
  parseBucketPath,
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

async function handleRequestOptions() {
  return new Response(null, {
    headers: {
      Allow: Object.keys(HANDLERS).join(", "),
      DAV: "1",
    },
  });
}

async function handleMethodNotAllowed() {
  return new Response(null, { status: 405 });
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

    const auth = request.headers.get("Authorization");
    if (!auth) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": `Basic realm="WebDAV"` },
      });
    }
    // UTF-8 安全的 Base64：与前端 createAuthHeaders 保持一致，
    // 否则用户名/密码含非 ASCII 字符时 btoa 会直接抛异常
    const expectedAuth = `Basic ${toBase64(
      `${env.WEBDAV_USERNAME}:${env.WEBDAV_PASSWORD}`
    )}`;
    if (auth !== expectedAuth)
      return new Response("Unauthorized", { status: 401 });
  }

  // 生成短时效签名分享链接（需要已认证）
  if (isShareRequest) {
    if (!shareSecret)
      return new Response(
        "Share links are not enabled: set WEBDAV_SHARE_SECRET",
        { status: 503 }
      );
    const ttl = Number(env.WEBDAV_SHARE_TTL ?? 86400) || 86400; // 秒，默认 24h
    const expires = Math.floor(Date.now() / 1000) + ttl;
    const token = await createShareToken(shareSecret, path, expires);
    const origin = new URL(request.url).origin;
    const shareUrl = `${origin}/webdav/${encodeKeyPath(path)}?token=${token}`;
    return new Response(JSON.stringify({ url: shareUrl }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const method: string = (context.request as Request).method;
  const handler = HANDLERS[method] ?? handleMethodNotAllowed;
  return handler({ bucket, path, request: context.request });
};
