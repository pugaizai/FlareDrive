// DELETE 分批语义：免费套餐 50 子请求预算、幂等重试、嵌套内容递归清理
import { handleRequestDelete } from "../../functions/webdav/delete";

jest.mock("p-limit", () => (concurrency: number) => {
  const limiter = (fn: () => unknown) => fn();
  limiter.concurrency = concurrency;
  return limiter;
});

const dirObject = {
  key: "dir/",
  httpMetadata: { contentType: "application/x-directory" },
};
const fileObject = {
  key: "a.txt",
  httpMetadata: { contentType: "text/plain" },
};

function makeBucket(objects: string[], headResult?: unknown) {
  return {
    head: jest.fn(async () => headResult ?? null),
    delete: jest.fn(async () => {}),
    list: jest.fn(async () => ({
      objects: objects.map((key) => ({ key })),
      truncated: false,
    })),
  };
}

const request = (url: string) =>
  ({ url, headers: { get: () => null } }) as unknown as Request;

it("deletes a file and returns 204", async () => {
  const bucket = makeBucket([], fileObject);
  const res = await handleRequestDelete({
    bucket,
    path: "a.txt",
    request: request("https://example.com/webdav/a.txt"),
  } as any);

  expect(res.status).toBe(204);
  expect(bucket.delete).toHaveBeenCalledWith("a.txt");
});

it("cleans up leftover children when the marker is already gone (idempotent retry)", async () => {
  const bucket = makeBucket(["dir/x.txt"]); // head → null（上次 503 后的重试）
  const res = await handleRequestDelete({
    bucket,
    path: "dir/",
    request: request("https://example.com/webdav/dir/"),
  } as any);

  expect(res.status).toBe(204);
  expect(bucket.delete).toHaveBeenCalledWith("dir/x.txt");
});

it("deletes at most 40 children per call and asks to retry when more remain", async () => {
  const keys = Array.from({ length: 50 }, (_, i) => `dir/f${i}.txt`);
  const bucket = makeBucket(keys, dirObject);
  const res = await handleRequestDelete({
    bucket,
    path: "dir/",
    request: request("https://example.com/webdav/dir/"),
  } as any);

  expect(res.status).toBe(503);
  expect(res.headers.get("Retry-After")).toBe("5");
  expect(bucket.delete).toHaveBeenCalledTimes(41); // 目录标记 + 40 个子对象
});

it("completes when the remaining children fit in one call", async () => {
  const keys = Array.from({ length: 10 }, (_, i) => `dir/f${i}.txt`);
  const bucket = makeBucket(keys); // 标记已在上次删除
  const res = await handleRequestDelete({
    bucket,
    path: "dir/",
    request: request("https://example.com/webdav/dir/"),
  } as any);

  expect(res.status).toBe(204);
  expect(bucket.delete).toHaveBeenCalledTimes(10);
});
