// 分享链接预览页：HTML 导航渲染下载页、非 HTML 客户端返回原始字节、?dl=1 强制附件下载
import { onRequest } from "../../functions/webdav/[[path]]";
import { createShareToken } from "../../functions/webdav/utils";

jest.mock("p-limit", () => (concurrency: number) => {
  const limiter = (fn: () => unknown) => fn();
  limiter.concurrency = concurrency;
  return limiter;
});

const onRequestUntyped = onRequest as (context: any) => Promise<Response>;

const fileObject = {
  key: "a.txt",
  size: 123,
  httpEtag: '"etag-a"',
  uploaded: new Date(),
  httpMetadata: { contentType: "text/plain" },
};

function makeBucket() {
  return {
    head: jest.fn(async () => fileObject),
    get: jest.fn(async () => ({ body: "data", writeHttpMetadata: () => {} })),
    list: jest.fn(async () => ({ objects: [], truncated: false })),
  };
}

function context(
  url: string,
  headers: Record<string, string | null>,
  bucket = makeBucket()
) {
  return {
    env: {
      WEBDAV_USERNAME: "user",
      WEBDAV_PASSWORD: "pass",
      BUCKET: bucket,
      WEBDAV_SHARE_SECRET: "s3cret",
    },
    request: {
      url,
      method: "GET",
      headers: { get: (name: string) => (name in headers ? headers[name] : null) },
    },
    params: { path: ["a.txt"] },
  };
}

const makeToken = async () => {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  return createShareToken("s3cret", "a.txt", expires);
};

it("renders a download page for browser navigation with a valid token", async () => {
  const token = await makeToken();
  const res = await onRequestUntyped(
    context(`https://example.com/webdav/a.txt?token=${token}`, {
      Accept: "text/html,application/xhtml+xml",
    })
  );

  expect(res.status).toBe(200);
  expect(res.headers.get("Content-Type")).toContain("text/html");
  const html = await res.text();
  expect(html).toContain("a.txt");
  expect(html).toContain("123.0 B");
  expect(html).toContain("Download");
  expect(html).toContain("dl=1");
});

it("serves raw bytes for non-HTML clients (API/curl)", async () => {
  const token = await makeToken();
  const bucket = makeBucket();
  const res = await onRequestUntyped(
    context(`https://example.com/webdav/a.txt?token=${token}`, { Accept: "*/*" }, bucket)
  );

  expect(res.status).toBe(200);
  expect(bucket.get).toHaveBeenCalled();
});

it("forces attachment download when dl=1", async () => {
  const token = await makeToken();
  const bucket = makeBucket();
  const res = await onRequestUntyped(
    context(`https://example.com/webdav/a.txt?token=${token}&dl=1`, {
      Accept: "text/html",
    }, bucket)
  );

  expect(res.status).toBe(200);
  expect(bucket.get).toHaveBeenCalled();
  expect(res.headers.get("Content-Disposition")).toContain("attachment");
  expect(res.headers.get("Content-Disposition")).toContain("a.txt");
});

it("does not render the page without a valid token (falls back to auth)", async () => {
  const res = await onRequestUntyped(
    context("https://example.com/webdav/a.txt?token=1.deadbeef", {
      Accept: "text/html",
    })
  );
  expect(res.status).toBe(401);
});
