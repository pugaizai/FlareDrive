// WebDAV COPY/MOVE 语义：复制到目标、Overwrite: F 防覆盖、MOVE = COPY + DELETE
import { handleRequestCopy } from "../../functions/webdav/copy";
import { handleRequestMove } from "../../functions/webdav/move";

jest.mock("p-limit", () => (concurrency: number) => {
  const limiter = (fn: () => unknown) => fn();
  limiter.concurrency = concurrency;
  return limiter;
});

const fileObject = {
  key: "a.txt",
  body: "content",
  httpMetadata: { contentType: "text/plain" },
  customMetadata: { thumbnail: "t1" },
};

function makeBucket(headFn?: (key: string) => unknown) {
  return {
    head: jest.fn(async (key: string) => (headFn ? headFn(key) : null)),
    get: jest.fn(async () => fileObject),
    put: jest.fn(async () => {}),
    delete: jest.fn(async () => {}),
    list: jest.fn(async () => ({ objects: [], truncated: false })),
  };
}

const request = (headers: Record<string, string>) =>
  ({
    url: "https://example.com/webdav/a.txt",
    headers: { get: (name: string) => headers[name] ?? null },
  } as unknown as Request);

it("copies a file to the destination", async () => {
  const bucket = makeBucket(); // 目标不存在
  const res = await handleRequestCopy({
    bucket,
    path: "a.txt",
    request: request({ Destination: "https://example.com/webdav/b.txt" }),
  } as any);

  expect(res.status).toBe(201);
  expect(bucket.put).toHaveBeenCalledWith("b.txt", "content", {
    httpMetadata: fileObject.httpMetadata,
    customMetadata: fileObject.customMetadata,
  });
});

it("refuses to overwrite when Overwrite: F and the destination exists", async () => {
  const bucket = makeBucket(() => fileObject); // 目标已存在
  const res = await handleRequestCopy({
    bucket,
    path: "a.txt",
    request: request({
      Destination: "https://example.com/webdav/b.txt",
      Overwrite: "F",
    }),
  } as any);

  expect(res.status).toBe(412);
  expect(bucket.put).not.toHaveBeenCalled();
});

it("moves a file: copies to the destination then deletes the source", async () => {
  const bucket = makeBucket((key) => (key === "a.txt" ? fileObject : null));
  const res = await handleRequestMove({
    bucket,
    path: "a.txt",
    request: request({ Destination: "https://example.com/webdav/b.txt" }),
  } as any);

  expect(res.status).toBe(204);
  expect(bucket.put).toHaveBeenCalledWith("b.txt", expect.anything(), expect.anything());
  expect(bucket.delete).toHaveBeenCalledWith("a.txt");
});

it("treats a 404 source as an already-completed move", async () => {
  // 源对象不存在（如并发删除或重复 MOVE）：返回 204 而非报错
  const bucket = makeBucket(() => null);
  const res = await handleRequestMove({
    bucket,
    path: "a.txt",
    request: request({ Destination: "https://example.com/webdav/b.txt" }),
  } as any);

  expect(res.status).toBe(204);
  expect(bucket.put).toHaveBeenCalled();
});

it("returns 503 with Retry-After when the source cannot be deleted", async () => {
  const bucket = makeBucket((key) => (key === "a.txt" ? fileObject : null));
  bucket.delete = jest.fn(async () => {
    throw new Error("boom");
  });

  const res = await handleRequestMove({
    bucket,
    path: "a.txt",
    request: request({ Destination: "https://example.com/webdav/b.txt" }),
  } as any);

  expect(res.status).toBe(503);
  expect(res.headers.get("Retry-After")).toBe("5");
  expect(bucket.delete).toHaveBeenCalledTimes(3); // 初试 + 2 次重试
});
