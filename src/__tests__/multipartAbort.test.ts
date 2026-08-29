// multipart 上传：分块失败时中止旧上传（不残留孤儿分块）
import { multipartUpload, SIZE_LIMIT } from "../app/transfer";
import { webdavFetch, notifyUnauthorized } from "../app/auth";

jest.mock("../app/auth", () => ({
  webdavFetch: jest.fn(),
  // CRA 的 jest 默认 resetMocks: true 会清掉 jest.fn 的实现，故用普通函数
  createAuthHeaders: () => ({}),
  notifyUnauthorized: jest.fn(),
}));

// p-limit 是 ESM-only 包，jest 27 无法转换，用即时执行的简单实现替代
jest.mock("p-limit", () => (concurrency: number) => {
  const limiter = (fn: () => unknown) => fn();
  limiter.concurrency = concurrency;
  return limiter;
});

const mockWebdavFetch = webdavFetch as jest.Mock;

// 模拟 XHR：静态控制成功/失败/状态码
class FakeXHR {
  static fail = true;
  static statusCode = 500;
  upload = { onprogress: null as unknown };
  status = 0;
  responseText = "";
  private responseHeaders = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  open() {}
  setRequestHeader() {}
  getAllResponseHeaders() {
    return this.responseHeaders;
  }
  send() {
    setTimeout(() => {
      if (FakeXHR.fail) {
        this.onerror?.();
      } else {
        this.status = FakeXHR.statusCode;
        this.responseHeaders = 'etag: "etag-1"\r\n';
        this.onload?.();
      }
    }, 0);
  }
}

const makeBigFile = (size: number) =>
  ({
    name: "big.bin",
    type: "application/octet-stream",
    size,
    slice: () => new Blob(),
  } as unknown as File);

beforeEach(() => {
  mockWebdavFetch.mockReset();
  // @ts-ignore
  global.XMLHttpRequest = FakeXHR;
});

it("aborts the multipart upload when a part upload fails", async () => {
  FakeXHR.fail = true;
  mockWebdavFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ uploadId: "u1" }),
  });

  await expect(
    multipartUpload("big.bin", makeBigFile(SIZE_LIMIT))
  ).rejects.toThrow();

  const abortCall = mockWebdavFetch.mock.calls.find(
    ([, init]) => (init as RequestInit)?.method === "DELETE"
  );
  expect(abortCall).toBeDefined();
  expect(String(abortCall![0])).toContain("uploadId=u1");
});

it("does not abort on a successful multipart upload", async () => {
  FakeXHR.fail = false;
  FakeXHR.statusCode = 200; // 非 2xx 的分片响应现在会中止上传（此前被误当成功）
  mockWebdavFetch
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ uploadId: "u2" }),
    })
    .mockResolvedValueOnce({ ok: true, text: async () => "" });

  const response = await multipartUpload("big.bin", makeBigFile(SIZE_LIMIT));
  expect(response).toBeDefined();

  const deleteCalls = mockWebdavFetch.mock.calls.filter(
    ([, init]) => (init as RequestInit)?.method === "DELETE"
  );
  expect(deleteCalls).toHaveLength(0);
});

it("notifies the auth dialog when a part upload returns 401", async () => {
  FakeXHR.fail = false;
  FakeXHR.statusCode = 401;
  mockWebdavFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ uploadId: "u3" }),
  });

  // 401 的分片响应必须中止上传（抛错并清理孤儿分块），而不是带着 etag=null
  // 继续走 complete；notifyUnauthorized 由 xhrFetch 在 onload 中触发
  await expect(
    multipartUpload("big.bin", makeBigFile(SIZE_LIMIT))
  ).rejects.toThrow();
  expect(notifyUnauthorized).toHaveBeenCalled();
  const abortCall = mockWebdavFetch.mock.calls.find(
    ([, init]) => (init as RequestInit)?.method === "DELETE"
  );
  expect(abortCall).toBeDefined();
});
