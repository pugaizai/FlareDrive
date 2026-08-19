// WebDAV 认证流程：401 质询、错误凭据拒绝、正确凭据放行、分享链接签发与 token 免认证
import { onRequest } from "../../functions/webdav/[[path]]";
import { createShareToken } from "../../functions/webdav/utils";

jest.mock("p-limit", () => (concurrency: number) => {
  const limiter = (fn: () => unknown) => fn();
  limiter.concurrency = concurrency;
  return limiter;
});

const basicAuth = (u: string, p: string) => "Basic " + btoa(`${u}:${p}`);

// onRequest 是 PagesFunction<...> 类型，测试里用宽松签名调用
const onRequestUntyped = onRequest as (context: any) => Promise<Response>;

function makeBucket() {
  return {
    head: jest.fn(async () => null),
    get: jest.fn(async () => ({ body: "data", writeHttpMetadata: () => {} })),
    list: jest.fn(async () => ({ objects: [], truncated: false })),
  };
}

function context(
  overrides: {
    env?: Record<string, unknown>;
    request?: Record<string, unknown>;
    /** URL 路径段，模拟 [[path]] 路由捕获 */
    params?: string[];
  } = {},
  bucket = makeBucket()
) {
  return {
    env: {
      WEBDAV_USERNAME: "user",
      WEBDAV_PASSWORD: "pass",
      BUCKET: bucket,
      ...overrides.env,
    },
    request: overrides.request ?? {
      url: "https://example.com/webdav/",
      method: "PROPFIND",
      headers: { get: () => null },
    },
    params: overrides.params ? { path: overrides.params } : {},
  };
}

const authHeaders = (value: string | null) => ({
  get: (name: string) => (name === "Authorization" ? value : null),
});

it("returns 401 with WWW-Authenticate when no credentials are provided", async () => {
  const res = await onRequestUntyped(context());
  expect(res.status).toBe(401);
  expect(res.headers.get("WWW-Authenticate")).toContain(
    'Basic realm="WebDAV"'
  );
});

it("rejects wrong credentials", async () => {
  const res = await onRequestUntyped(
    context({
      request: {
        url: "https://example.com/webdav/",
        method: "PROPFIND",
        headers: authHeaders(basicAuth("user", "wrong")),
      },
    })
  );
  expect(res.status).toBe(401);
});

it("serves PROPFIND with valid credentials", async () => {
  const res = await onRequestUntyped(
    context({
      request: {
        url: "https://example.com/webdav/",
        method: "PROPFIND",
        headers: authHeaders(basicAuth("user", "pass")),
      },
    })
  );
  expect(res.status).toBe(207);
});

it("returns 503 for share requests when WEBDAV_SHARE_SECRET is not set", async () => {
  const res = await onRequestUntyped(
    context({
      params: ["a.txt"],
      request: {
        url: "https://example.com/webdav/a.txt?share",
        method: "GET",
        headers: authHeaders(basicAuth("user", "pass")),
      },
    })
  );
  expect(res.status).toBe(503);
});

it("issues a signed share link when WEBDAV_SHARE_SECRET is set", async () => {
  const res = await onRequestUntyped(
    context({
      env: { WEBDAV_SHARE_SECRET: "s3cret" },
      params: ["a.txt"],
      request: {
        url: "https://example.com/webdav/a.txt?share",
        method: "GET",
        headers: authHeaders(basicAuth("user", "pass")),
      },
    })
  );
  expect(res.status).toBe(200);
  const body = await res.json();
  expect((body as { url: string }).url).toContain("/webdav/a.txt?token=");
});

it("serves GET with a valid share token and no credentials", async () => {
  const bucket = makeBucket();
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = await createShareToken("s3cret", "a.txt", expires);

  const res = await onRequestUntyped(
    context(
      {
        env: { WEBDAV_SHARE_SECRET: "s3cret" },
        params: ["a.txt"],
        request: {
          url: `https://example.com/webdav/a.txt?token=${token}`,
          method: "GET",
          headers: authHeaders(null),
        },
      },
      bucket
    )
  );
  expect(res.status).toBe(200);
  expect(bucket.get).toHaveBeenCalledWith("a.txt", expect.anything());
});

it("rejects an invalid share token (falls back to Basic auth)", async () => {
  const res = await onRequestUntyped(
    context({
      env: { WEBDAV_SHARE_SECRET: "s3cret" },
      params: ["a.txt"],
      request: {
        url: "https://example.com/webdav/a.txt?token=1.deadbeef",
        method: "GET",
        headers: authHeaders(null),
      },
    })
  );
  expect(res.status).toBe(401);
});
