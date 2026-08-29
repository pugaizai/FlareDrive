// Main 回归：目录切换竞态守卫（陈旧 PROPFIND 不得覆盖新列表）与
// hash 路由按段编码（文件名含 % 时不再弹回根目录）
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import Main from "../Main";
import { FileItem } from "../FileGrid";
import { fetchPath } from "../app/transfer";

const mockFetchPath = fetchPath as jest.Mock;

beforeEach(() => {
  mockFetchPath.mockReset();
});

jest.mock("../app/transfer", () => ({
  fetchPath: jest.fn(),
  deletePaths: jest.fn(),
  copyPaste: jest.fn(),
  createFolderAt: jest.fn(),
}));

jest.mock("../app/auth", () => ({
  webdavFetch: jest.fn(),
  createAuthHeaders: () => ({}),
  notifyUnauthorized: jest.fn(),
  subscribeAuthChanged: () => () => {},
  subscribeUnauthorized: () => () => {},
}));

jest.mock("../app/transferQueue", () => ({
  useTransferQueue: () => [],
  useUploadEnqueue: () => jest.fn(),
}));

const item = (key: string, dir = false): FileItem => ({
  key,
  size: 10,
  uploaded: "Wed, 20 Jun 2024 12:00:00 GMT",
  httpMetadata: { contentType: dir ? "application/x-directory" : "text/plain" },
});

const renderMain = () =>
  render(
    <Main search="" onError={jest.fn()} sort="name-asc" view="list" />
  );

it("drops a stale directory listing when navigation outruns the network", async () => {
  let resolveRoot!: (files: FileItem[]) => void;
  let resolveSub!: (files: FileItem[]) => void;
  let resolveBack!: (files: FileItem[]) => void;
  const deferred = (register: (r: (f: FileItem[]) => void) => void) =>
    new Promise<FileItem[]>((r) => register(r));
  mockFetchPath
    .mockImplementationOnce(() => deferred((r) => (resolveRoot = r)))
    .mockImplementationOnce(() => deferred((r) => (resolveSub = r)))
    .mockImplementationOnce(() => deferred((r) => (resolveBack = r)));

  renderMain();
  resolveRoot([item("root.txt"), item("sub", true)]);
  await screen.findByText("root.txt");

  // 进入 sub（第二次 PROPFIND，在途），随即返回根目录（第三次 PROPFIND）
  fireEvent.click(screen.getByText("sub"));
  await act(async () => {
    window.location.hash = "";
    window.dispatchEvent(new Event("hashchange"));
  });
  await waitFor(() => expect(mockFetchPath).toHaveBeenCalledTimes(3));

  // 根目录响应先落定，随后才到达的 sub（陈旧）响应不得覆盖列表
  resolveBack([item("fresh-root-file.txt")]);
  await screen.findByText("fresh-root-file.txt");

  await act(async () => {
    resolveSub([item("stale-sub-file.txt")]);
    await Promise.resolve();
  });

  expect(screen.queryByText("stale-sub-file.txt")).toBeNull();
  expect(screen.getByText("fresh-root-file.txt")).toBeTruthy();
});

it("round-trips a folder name containing % through the hash", async () => {
  mockFetchPath
    .mockResolvedValueOnce([item("100%", true), item("root.txt")]) // 根目录
    .mockResolvedValueOnce([]); // 进入 "100%/" 后的列表

  renderMain();
  await screen.findByText("root.txt");

  // 进入 "100%" 目录：hash 必须按段编码（% → %25，尾斜杠保留）
  fireEvent.click(screen.getByText("100%"));
  await waitFor(() => expect(window.location.hash).toBe("#100%25/"));

  // hashchange（模拟刷新后恢复）：解码不抛错，停留在该目录，不弹回根目录
  await act(async () => {
    window.dispatchEvent(new Event("hashchange"));
    await Promise.resolve();
  });
  expect(mockFetchPath).toHaveBeenLastCalledWith("100%/");
  await screen.findByText("No files or folders");
});
