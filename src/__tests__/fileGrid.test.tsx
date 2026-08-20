// FileGrid：网格/列表两种视图渲染、空状态、文件预览走应用内认证
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import FileGrid, { FileItem } from "../FileGrid";
import { webdavFetch } from "../app/auth";

jest.mock("../app/auth", () => ({
  webdavFetch: jest.fn(),
  createAuthHeaders: () => ({}),
  notifyUnauthorized: jest.fn(),
}));

const item = (key: string, dir = false): FileItem => ({
  key,
  size: 10,
  uploaded: "Wed, 20 Jun 2024 12:00:00 GMT",
  httpMetadata: { contentType: dir ? "application/x-directory" : "text/plain" },
});

const baseProps = {
  files: [item("a.txt"), item("sub", true)],
  onCwdChange: jest.fn(),
  multiSelected: null,
  onMultiSelect: jest.fn(),
  emptyMessage: <div>No files or folders</div>,
};

beforeEach(() => {
  (webdavFetch as jest.Mock).mockReset();
});

it("renders files in grid view (default layout)", () => {
  render(<FileGrid {...baseProps} view="grid" />);
  expect(screen.getByText("a.txt")).toBeTruthy();
  expect(screen.getByText("sub")).toBeTruthy();
});

it("renders files in list view", () => {
  render(<FileGrid {...baseProps} view="list" />);
  expect(screen.getByText("a.txt")).toBeTruthy();
  expect(screen.getByText("sub")).toBeTruthy();
  expect(screen.getByText("10.0 B")).toBeTruthy(); // 行内显示大小
});

it("shows the empty message when there are no files", () => {
  render(<FileGrid {...baseProps} files={[]} view="grid" />);
  expect(screen.getByText("No files or folders")).toBeTruthy();
});

it("previews a file via authenticated fetch, not a native navigation", async () => {
  (webdavFetch as jest.Mock).mockResolvedValue({
    ok: true,
    blob: async () => new Blob(["data"]),
  });
  const openSpy = jest.spyOn(window, "open").mockImplementation(() => null);
  // jsdom 未实现 URL.createObjectURL，需打桩
  Object.defineProperty(URL, "createObjectURL", {
    writable: true,
    configurable: true,
    value: jest.fn(() => "blob:fake"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    writable: true,
    configurable: true,
    value: jest.fn(),
  });

  render(<FileGrid {...baseProps} view="grid" />);
  fireEvent.click(screen.getByText("a.txt"));

  await waitFor(() =>
    expect(webdavFetch).toHaveBeenCalledWith("/webdav/a.txt")
  );
  await waitFor(() =>
    expect(openSpy).toHaveBeenCalledWith(
      "blob:fake",
      "_blank",
      "noopener,noreferrer"
    )
  );
});
