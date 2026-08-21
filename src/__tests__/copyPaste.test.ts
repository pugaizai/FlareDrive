// copyPaste / createFolderAt 前端调用：请求方法、Destination/Overwrite 头、错误透传、文件名校验
import { copyPaste, createFolderAt } from "../app/transfer";
import { webdavFetch } from "../app/auth";

jest.mock("../app/auth", () => ({
  webdavFetch: jest.fn(),
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

beforeEach(() => {
  mockWebdavFetch.mockReset();
});

it("sends a MOVE request with the Destination header", async () => {
  mockWebdavFetch.mockResolvedValue({ ok: true });
  await copyPaste("a.txt", "b.txt", true);

  expect(mockWebdavFetch).toHaveBeenCalledWith(
    "/webdav/a.txt",
    expect.objectContaining({
      method: "MOVE",
      headers: expect.objectContaining({
        Destination: expect.stringMatching(/\/webdav\/b\.txt$/),
      }),
    })
  );
});

it("sends Overwrite: F when dontOverwrite is set", async () => {
  mockWebdavFetch.mockResolvedValue({ ok: true });
  await copyPaste("a.txt", "b.txt", true, true);

  const [, init] = mockWebdavFetch.mock.calls[0];
  expect((init as RequestInit).headers).toMatchObject({ Overwrite: "F" });
});

it("throws an error carrying the HTTP status on failure", async () => {
  mockWebdavFetch.mockResolvedValue({ ok: false, status: 412 });
  await expect(copyPaste("a.txt", "b.txt", true, true)).rejects.toThrow(/412/);
});

it("retries a COPY on 503 (batching) until it completes", async () => {
  // Retry-After 用极小值，让 sleep 走真实定时器且几乎不耗时
  mockWebdavFetch
    .mockResolvedValueOnce({
      ok: false,
      status: 503,
      headers: { get: () => "0.001" },
    })
    .mockResolvedValueOnce({
      ok: false,
      status: 503,
      headers: { get: () => "0.001" },
    })
    .mockResolvedValueOnce({ ok: true, status: 201, headers: { get: () => null } });

  await copyPaste("a.txt", "b.txt", false);

  expect(mockWebdavFetch).toHaveBeenCalledTimes(3);
});

it("does not retry a MOVE on 503 (destination may already exist on retry)", async () => {
  mockWebdavFetch.mockResolvedValue({
    ok: false,
    status: 503,
    headers: { get: () => "0.001" },
  });

  await expect(copyPaste("a.txt", "b.txt", true)).rejects.toThrow(/503/);
  expect(mockWebdavFetch).toHaveBeenCalledTimes(1);
});

it("creates a folder via MKCOL", async () => {
  mockWebdavFetch.mockResolvedValue({ ok: true });

  await createFolderAt("sub/", "newdir");
  expect(mockWebdavFetch).toHaveBeenCalledWith(
    "/webdav/sub/newdir",
    expect.objectContaining({ method: "MKCOL" })
  );
});

it("rejects folder names containing / without calling the server", async () => {
  await expect(createFolderAt("", "a/b")).rejects.toThrow(
    "Invalid folder name"
  );
  expect(mockWebdavFetch).not.toHaveBeenCalled();
});
