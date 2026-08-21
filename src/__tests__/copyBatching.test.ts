// COPY 目录分批：免费套餐 50 子请求预算、跳过已存在目标推进、503 + Retry-After 重试
import { handleRequestCopy } from "../../functions/webdav/copy";

const dirObject = {
  key: "dir",
  body: "",
  httpMetadata: { contentType: "application/x-directory" },
  customMetadata: undefined,
};
const childObject = (key: string) => ({
  key,
  body: "content",
  httpMetadata: { contentType: "text/plain" },
  customMetadata: undefined,
});

// 有状态的 bucket：put 过的目标会被记录，之后的 head 能命中（模拟客户端重试）
function makeStatefulBucket(children: string[]) {
  const copied = new Set<string>();
  return {
    head: jest.fn(async (key: string) => {
      if (key === "dir") return dirObject;
      if (copied.has(key))
        return { key, httpMetadata: { contentType: "text/plain" } };
      return null;
    }),
    get: jest.fn(async (key: string) =>
      key === "dir" ? dirObject : childObject(key)
    ),
    put: jest.fn(async (key: string) => {
      copied.add(key);
    }),
    list: jest.fn(async () => ({
      objects: children.map((key) => ({ key })),
      truncated: false,
    })),
  };
}

const copyRequest = () =>
  ({
    url: "https://example.com/webdav/dir",
    headers: {
      get: (name: string) =>
        ({
          Destination: "https://example.com/webdav/dst",
          Depth: "infinity",
        }[name] ?? null),
    },
  } as unknown as Request);

it("copies a directory in batches, asking to retry when children remain", async () => {
  const children = Array.from({ length: 25 }, (_, i) => `dir/f${i}.txt`);
  const bucket = makeStatefulBucket(children);

  const first = await handleRequestCopy({
    bucket,
    path: "dir",
    request: copyRequest(),
  } as any);

  expect(first.status).toBe(503);
  expect(first.headers.get("Retry-After")).toBe("5");
  // 1(目录标记) + 15(子对象) = 16 次 put
  expect(bucket.put).toHaveBeenCalledTimes(16);

  // 客户端重试：已复制的目标被跳过，继续复制剩余子对象
  const second = await handleRequestCopy({
    bucket,
    path: "dir",
    request: copyRequest(),
  } as any);

  expect(second.status).toBe(204); // 目标标记已存在 → 204
  // 第二次：目录标记 1 次 + 前 15 个跳过 + 剩余 10 个子对象
  expect(bucket.put).toHaveBeenCalledTimes(16 + 1 + 10);
});

it("completes a directory copy in one call when it fits the budget", async () => {
  const children = Array.from({ length: 10 }, (_, i) => `dir/f${i}.txt`);
  const bucket = makeStatefulBucket(children);

  const res = await handleRequestCopy({
    bucket,
    path: "dir",
    request: copyRequest(),
  } as any);

  expect(res.status).toBe(201);
  expect(bucket.put).toHaveBeenCalledTimes(11); // 标记 + 10 个子对象
});
