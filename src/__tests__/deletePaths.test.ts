// deletePaths 前端删除重试：503 + Retry-After 自动重试直至完成、非 503 错误透传、
// 重试上限超时保护
import { deletePaths } from "../app/transfer";
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

// Retry-After 用极小值，让 sleep 走真实定时器且几乎不耗时
const ok = { ok: true, status: 204, headers: { get: () => null } };
const retry = { ok: false, status: 503, headers: { get: () => "0.001" } };
const forbidden = { ok: false, status: 403, headers: { get: () => null } };

beforeEach(() => {
  mockWebdavFetch.mockReset();
});

it("deletes each path with DELETE", async () => {
  mockWebdavFetch.mockResolvedValue(ok);
  await deletePaths(["a.txt", "b.txt"]);

  expect(mockWebdavFetch).toHaveBeenCalledTimes(2);
  expect(mockWebdavFetch).toHaveBeenCalledWith("/webdav/a.txt", {
    method: "DELETE",
  });
  expect(mockWebdavFetch).toHaveBeenCalledWith("/webdav/b.txt", {
    method: "DELETE",
  });
});

it("retries on 503 until the directory is fully deleted", async () => {
  mockWebdavFetch
    .mockResolvedValueOnce(ok)
    .mockResolvedValueOnce(retry)
    .mockResolvedValueOnce(retry)
    .mockResolvedValueOnce(ok);

  await deletePaths(["a.txt", "dir/"]);

  expect(mockWebdavFetch).toHaveBeenCalledTimes(4);
});

it("throws the first non-503 error but still deletes the remaining paths", async () => {
  mockWebdavFetch
    .mockResolvedValueOnce(ok)
    .mockResolvedValueOnce(forbidden)
    .mockResolvedValueOnce(ok);

  await expect(deletePaths(["a.txt", "locked.txt", "c.txt"])).rejects.toThrow(
    /403/
  );
  expect(mockWebdavFetch).toHaveBeenCalledTimes(3);
});

it("gives up with a timeout error after exhausting retries", async () => {
  mockWebdavFetch.mockResolvedValue(retry);

  await expect(deletePaths(["dir/"])).rejects.toThrow(/timed out/);
});
