// GET 语义回归：Range 206/416、If-None-Match 304、元数据响应头、目录 405、
// ?dl=1 文件名控制字符消毒
import { handleRequestGet } from "../../functions/webdav/get";

const makeFileObject = (over: Record<string, unknown> = {}) => ({
  key: "video.mp4",
  size: 1000,
  httpEtag: '"etag-1"',
  uploaded: new Date("2024-06-20T12:00:00Z"),
  httpMetadata: { contentType: "video/mp4" },
  writeHttpMetadata: (headers: Headers) =>
    headers.set("Content-Type", "video/mp4"),
  body: "x".repeat(1000),
  ...over,
});

function makeBucket(obj: Record<string, unknown> = makeFileObject()) {
  return {
    head: jest.fn(async () => obj),
    get: jest.fn(async () => obj),
  };
}

const request = (
  headers: Record<string, string> = {},
  url = "https://example.com/webdav/video.mp4"
) =>
  ({
    url,
    headers: { get: (name: string) => headers[name] ?? null },
  } as unknown as Request);

it("returns 206 with Content-Range for a single byte range", async () => {
  const res = await handleRequestGet({
    bucket: makeBucket(),
    path: "video.mp4",
    request: request({ Range: "bytes=0-1023" }),
  } as any);

  expect(res.status).toBe(206);
  // 末端越界被钳制到文件末尾
  expect(res.headers.get("Content-Range")).toBe("bytes 0-999/1000");
  expect(res.headers.get("Content-Length")).toBe("1000");
  expect(res.headers.get("Accept-Ranges")).toBe("bytes");
  expect(res.headers.get("ETag")).toBe('"etag-1"');
  expect(res.headers.get("Last-Modified")).toBeTruthy();
});

it("serves a suffix range (-n) with the correct 206 window", async () => {
  const res = await handleRequestGet({
    bucket: makeBucket(),
    path: "video.mp4",
    request: request({ Range: "bytes=-100" }),
  } as any);

  expect(res.status).toBe(206);
  expect(res.headers.get("Content-Range")).toBe("bytes 900-999/1000");
  expect(res.headers.get("Content-Length")).toBe("100");
});

it("returns 416 with bytes */size for an unsatisfiable range", async () => {
  const res = await handleRequestGet({
    bucket: makeBucket(),
    path: "video.mp4",
    request: request({ Range: "bytes=5000-" }),
  } as any);

  expect(res.status).toBe(416);
  expect(res.headers.get("Content-Range")).toBe("bytes */1000");
});

it("ignores multi-range headers and serves the full body (200)", async () => {
  const res = await handleRequestGet({
    bucket: makeBucket(),
    path: "video.mp4",
    request: request({ Range: "bytes=0-1,3-4" }),
  } as any);

  expect(res.status).toBe(200);
  expect(res.headers.get("Content-Length")).toBe("1000");
});

it("returns 304 for a matching If-None-Match (was 412)", async () => {
  const res = await handleRequestGet({
    bucket: makeBucket(),
    path: "video.mp4",
    request: request({ "If-None-Match": '"etag-1"' }),
  } as any);

  expect(res.status).toBe(304);
  expect(res.headers.get("ETag")).toBe('"etag-1"');
});

it("accepts a weak If-None-Match comparison", async () => {
  const res = await handleRequestGet({
    bucket: makeBucket(),
    path: "video.mp4",
    request: request({ "If-None-Match": 'W/"etag-1"' }),
  } as any);

  expect(res.status).toBe(304);
});

it("serves the body when If-None-Match does not match", async () => {
  const res = await handleRequestGet({
    bucket: makeBucket(),
    path: "video.mp4",
    request: request({ "If-None-Match": '"other"' }),
  } as any);

  expect(res.status).toBe(200);
});

it("returns 405 for a directory marker instead of a 0-byte download", async () => {
  const bucket = makeBucket(
    makeFileObject({
      httpMetadata: { contentType: "application/x-directory" },
    })
  );
  const res = await handleRequestGet({
    bucket,
    path: "dir",
    request: request(),
  } as any);

  expect(res.status).toBe(405);
  expect(res.headers.get("Allow")).toContain("PROPFIND");
});

it("strips control characters from the ?dl=1 filename", async () => {
  const res = await handleRequestGet({
    bucket: makeBucket(makeFileObject({ key: "a\nb.txt" })),
    path: "a\nb.txt",
    request: request({}, "https://example.com/webdav/a%0Ab.txt?dl=1"),
  } as any);

  // 此前换行符会传进 Content-Disposition（Workers 端抛异常 → 500）
  const disposition = res.headers.get("Content-Disposition") ?? "";
  expect(disposition).toContain("attachment");
  expect(disposition).not.toContain("\n");
  expect(disposition).toContain("a_b.txt");
});
