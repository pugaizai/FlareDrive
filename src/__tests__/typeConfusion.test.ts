// 类型混淆与输入校验回归：PUT/COPY/MKCOL 的目录/文件检查、畸形头 400、
// DELETE 404、PROPFIND `$` 注入、路由空路径守卫、路径解码容错
import { handleRequestPut } from "../../functions/webdav/put";
import { handleRequestMkcol } from "../../functions/webdav/mkcol";
import { handleRequestCopy } from "../../functions/webdav/copy";
import { handleRequestDelete } from "../../functions/webdav/delete";
import { handleRequestPropfind } from "../../functions/webdav/propfind";
import { onRequest } from "../../functions/webdav/[[path]]";
import { parseBucketPath } from "../../functions/webdav/utils";

// p-limit 是 ESM-only 包，jest 无法转换，用即时执行的简单实现替代
jest.mock("p-limit", () => (concurrency: number) => {
  const limiter = (fn: () => unknown) => fn();
  limiter.concurrency = concurrency;
  return limiter;
});

const dirMarker = (key: string) => ({
  key,
  size: 0,
  uploaded: new Date(),
  httpMetadata: { contentType: "application/x-directory" },
});

const request = (
  url: string,
  headers: Record<string, string | null> = {},
  body: unknown = null
) =>
  ({
    url,
    headers: { get: (name: string) => headers[name] ?? null },
    body,
    // 模拟真实 Request 的读取：按字节读出 body（mkcol 据此区分空 body 与无 body）
    arrayBuffer: async () =>
      typeof body === "string"
        ? (new TextEncoder().encode(body).buffer as ArrayBuffer)
        : new ArrayBuffer(0),
  } as unknown as Request);

it("PUT onto an existing directory marker returns 405 (children stay visible)", async () => {
  const bucket = {
    head: jest.fn(async (key: string) =>
      key === "d" ? dirMarker("d") : null
    ),
    put: jest.fn(),
  };
  const res = await handleRequestPut({
    bucket,
    path: "d",
    request: request("https://example.com/webdav/d"),
  } as any);

  expect(res.status).toBe(405);
  expect(bucket.put).not.toHaveBeenCalled();
});

it("PUT under a file parent returns 409 (no invisible children)", async () => {
  const bucket = {
    head: jest.fn(async (key: string) =>
      key === "f.txt"
        ? { key: "f.txt", httpMetadata: { contentType: "text/plain" } }
        : null
    ),
    put: jest.fn(),
  };
  const res = await handleRequestPut({
    bucket,
    path: "f.txt/child",
    request: request("https://example.com/webdav/f.txt/child"),
  } as any);

  expect(res.status).toBe(409);
  expect(bucket.put).not.toHaveBeenCalled();
});

it("MKCOL under a file parent returns 409", async () => {
  const bucket = {
    head: jest.fn(async (key: string) =>
      key === "f.txt"
        ? { key: "f.txt", httpMetadata: { contentType: "text/plain" } }
        : null
    ),
    put: jest.fn(),
  };
  const res = await handleRequestMkcol({
    bucket,
    path: "f.txt/sub",
    request: request("https://example.com/webdav/f.txt/sub"),
  } as any);

  expect(res.status).toBe(409);
  expect(bucket.put).not.toHaveBeenCalled();
});

it("MKCOL with a non-empty request body returns 415", async () => {
  const bucket = {
    head: jest.fn(async () => null),
    put: jest.fn(),
  };
  const res = await handleRequestMkcol({
    bucket,
    path: "newdir",
    request: request("https://example.com/webdav/newdir", {}, "<xml/>"),
  } as any);

  expect(res.status).toBe(415);
  expect(bucket.put).not.toHaveBeenCalled();
});

it("MKCOL with an empty body (Content-Length: 0, e.g. Dart webdav_client) creates the directory", async () => {
  const bucket = {
    head: jest.fn(async () => null),
    put: jest.fn(),
  };
  const res = await handleRequestMkcol({
    bucket,
    path: "simple_live_app",
    request: request("https://example.com/webdav/simple_live_app", {
      "Content-Type": "application/xml",
      "Content-Length": "0",
    }),
  } as any);

  expect(res.status).toBe(201);
  expect(bucket.put).toHaveBeenCalledWith(
    "simple_live_app",
    "",
    expect.objectContaining({
      httpMetadata: { contentType: "application/x-directory" },
    })
  );
});

it("COPY of a file onto a directory marker returns 405", async () => {
  const bucket = {
    head: jest.fn(async (key: string) =>
      key === "d" ? dirMarker("d") : null
    ),
    get: jest.fn(async () => ({
      key: "a.txt",
      body: "data",
      httpMetadata: { contentType: "text/plain" },
    })),
    put: jest.fn(),
    list: jest.fn(async () => ({ objects: [], truncated: false })),
  };
  const res = await handleRequestCopy({
    bucket,
    path: "a.txt",
    request: request("https://example.com/webdav/a.txt", {
      Destination: "https://example.com/webdav/d",
    }),
  } as any);

  expect(res.status).toBe(405);
  expect(bucket.put).not.toHaveBeenCalled();
});

it("COPY with an unparsable Destination returns 400 instead of 500", async () => {
  const bucket = {
    head: jest.fn(async () => null),
    get: jest.fn(async () => ({
      key: "a.txt",
      body: "data",
      httpMetadata: { contentType: "text/plain" },
    })),
    put: jest.fn(),
  };
  const res = await handleRequestCopy({
    bucket,
    path: "a.txt",
    request: request("https://example.com/webdav/a.txt", {
      Destination: "https://example.com/webdav/%zz", // 非法百分号编码
    }),
  } as any);

  expect(res.status).toBe(400);
});

it("COPY with a Destination outside the WebDAV endpoint returns 400", async () => {
  const bucket = {
    head: jest.fn(async () => null),
    get: jest.fn(async () => ({
      key: "a.txt",
      body: "data",
      httpMetadata: { contentType: "text/plain" },
    })),
    put: jest.fn(),
  };
  const res = await handleRequestCopy({
    bucket,
    path: "a.txt",
    request: request("https://example.com/webdav/a.txt", {
      Destination: "https://example.com/other/x",
    }),
  } as any);

  expect(res.status).toBe(400);
});

it("COPY with an Overwrite header other than T/F returns 400", async () => {
  const bucket = {
    head: jest.fn(async () => null),
    get: jest.fn(async () => ({
      key: "a.txt",
      body: "data",
      httpMetadata: { contentType: "text/plain" },
    })),
    put: jest.fn(),
  };
  const res = await handleRequestCopy({
    bucket,
    path: "a.txt",
    request: request("https://example.com/webdav/a.txt", {
      Destination: "https://example.com/webdav/b.txt",
      Overwrite: "X",
    }),
  } as any);

  expect(res.status).toBe(400);
});

it("DELETE of a nonexistent resource returns 404", async () => {
  const bucket = {
    head: jest.fn(async () => null),
    list: jest.fn(async () => ({ objects: [], truncated: false })),
    delete: jest.fn(),
  };
  const res = await handleRequestDelete({
    bucket,
    path: "nope",
    request: request("https://example.com/webdav/nope"),
  } as any);

  expect(res.status).toBe(404);
});

it("filenames containing `$` sequences cannot break the PROPFIND XML", async () => {
  // `$'` 旧实现会把模板尾部（含 </multistatus>）注入到替换文本中
  const bucket = {
    head: jest.fn(async () => null),
    list: jest.fn(async () => ({
      objects: [
        {
          key: "$'`$&",
          uploaded: new Date(),
          size: 1,
          httpMetadata: { contentType: "text/plain" },
        },
      ],
      truncated: false,
    })),
  };
  const res = await handleRequestPropfind({
    bucket,
    path: "",
    request: request("https://example.com/webdav/", {
      Depth: "1",
    }),
  } as any);

  expect(res.status).toBe(207);
  const xml = await res.text();
  expect(xml.match(/<\/multistatus>/g)).toHaveLength(1);
});

it("route guard: GET on the empty path returns 400 instead of 500", async () => {
  const res = await (onRequest as (context: any) => Promise<Response>)({
    env: {
      WEBDAV_USERNAME: "user",
      WEBDAV_PASSWORD: "pass",
      BUCKET: {},
    },
    request: {
      url: "https://example.com/webdav/",
      method: "GET",
      headers: {
        get: (name: string) =>
          name === "Authorization" ? "Basic " + btoa("user:pass") : null,
      },
    },
    params: {},
  });
  expect(res.status).toBe(400);
});

it("parseBucketPath survives filenames with a literal percent sign", () => {
  const bucket = {};
  // 运行时已预解码参数（文件名含字面 %）：
  const [, decoded] = parseBucketPath({
    request: { url: "https://example.com/webdav/100%.txt" },
    env: { BUCKET: bucket },
    params: { path: ["100%.txt"] },
  });
  expect(decoded).toBe("100%.txt");
  // 运行时未预解码参数（URL 编码形式）：
  const [, decodedRaw] = parseBucketPath({
    request: { url: "https://example.com/webdav/100%25.txt" },
    env: { BUCKET: bucket },
    params: { path: ["100%25.txt"] },
  });
  expect(decodedRaw).toBe("100%.txt");
});
