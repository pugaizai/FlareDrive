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
