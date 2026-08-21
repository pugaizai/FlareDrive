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
  onSelectMany: jest.fn(),
  emptyMessage: <div>No files or folders</div>,
};

// 为容器与行提供矩形几何，使框选相交计算在 jsdom 中可测
const mockRects = (container: HTMLElement) => {
  const crect = {
    left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600,
    x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect;
  jest.spyOn(container, "getBoundingClientRect").mockReturnValue(crect);
  // 需要真实行元素来模拟矩形几何，属规则允许的例外
  // eslint-disable-next-line testing-library/no-node-access
  container.querySelectorAll<HTMLElement>("[data-key]").forEach((row, i) => {
    jest.spyOn(row, "getBoundingClientRect").mockReturnValue({
      left: i * 100, top: 0, right: i * 100 + 80, bottom: 50,
      width: 80, height: 50, x: i * 100, y: 0, toJSON: () => ({}),
    } as DOMRect);
  });
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

it("box-selects files by dragging", () => {
  const onSelectMany = jest.fn();
  render(
    <FileGrid
      files={[item("a.txt"), item("b.txt"), item("c.txt")]}
      onCwdChange={jest.fn()}
      multiSelected={null}
      onMultiSelect={jest.fn()}
      view="grid"
      onSelectMany={onSelectMany}
    />
  );
  const container = screen.getByTestId("file-grid");
  mockRects(container);

  fireEvent.pointerDown(container, { clientX: 0, clientY: 0, button: 0 });
  fireEvent.pointerMove(container, { clientX: 250, clientY: 60 });
  fireEvent.pointerUp(container, { clientX: 250, clientY: 60 });

  // 三行分别位于 x=0/100/200，宽 80，全部与 0..250 的框相交
  expect(onSelectMany).toHaveBeenCalledWith(["a.txt", "b.txt", "c.txt"]);
});

it("navigates into a folder on a plain click (no drag)", () => {
  const onCwdChange = jest.fn();
  render(
    <FileGrid
      files={[item("sub", true)]}
      onCwdChange={onCwdChange}
      multiSelected={null}
      onMultiSelect={jest.fn()}
      view="grid"
      onSelectMany={jest.fn()}
    />
  );
  const container = screen.getByTestId("file-grid");
  // eslint-disable-next-line testing-library/no-node-access
  const row = container.querySelector('[data-key="sub"]') as HTMLElement;

  // 无拖拽的点击：pointer 序列后浏览器派发 click，应正常进入目录
  fireEvent.pointerDown(row, { clientX: 0, clientY: 0, button: 0 });
  fireEvent.pointerUp(row, { clientX: 0, clientY: 0, button: 0 });
  fireEvent.click(row);

  expect(onCwdChange).toHaveBeenCalledWith("sub/");
});

it("clears the selection when clicking empty space (no drag)", () => {
  const onSelectMany = jest.fn();
  render(
    <FileGrid
      files={[item("a.txt"), item("b.txt")]}
      onCwdChange={jest.fn()}
      multiSelected={null}
      onMultiSelect={jest.fn()}
      view="grid"
      onSelectMany={onSelectMany}
    />
  );
  const container = screen.getByTestId("file-grid");

  // 点击空白处（target 不是行）且无拖拽 → 清空选择
  fireEvent.pointerDown(container, { clientX: 0, clientY: 0, button: 0 });
  fireEvent.pointerUp(container, { clientX: 0, clientY: 0 });

  expect(onSelectMany).toHaveBeenCalledWith([]);
});

it("does not open a file when box-dragging over a row", () => {
  (webdavFetch as jest.Mock).mockResolvedValue({
    ok: true,
    blob: async () => new Blob(["x"]),
  });
  jest.spyOn(window, "open").mockImplementation(() => null);
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

  const onSelectMany = jest.fn();
  render(
    <FileGrid
      files={[item("a.txt"), item("b.txt")]}
      onCwdChange={jest.fn()}
      multiSelected={null}
      onMultiSelect={jest.fn()}
      view="grid"
      onSelectMany={onSelectMany}
    />
  );
  const container = screen.getByTestId("file-grid");
  mockRects(container);
  // eslint-disable-next-line testing-library/no-node-access
  const row = container.querySelector('[data-key="a.txt"]') as HTMLElement;

  fireEvent.pointerDown(row, { clientX: 0, clientY: 0, button: 0 });
  fireEvent.pointerMove(container, { clientX: 120, clientY: 40 });
  fireEvent.pointerUp(container, { clientX: 120, clientY: 40 });

  expect(onSelectMany).toHaveBeenCalled();
  expect(webdavFetch).not.toHaveBeenCalled(); // 框选拖拽不应触发文件打开
});

it("disables native image dragging on thumbnails so box selection is not hijacked", async () => {
  (webdavFetch as jest.Mock).mockResolvedValue({
    ok: true,
    blob: async () => new Blob(["img"]),
  });
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

  render(
    <FileGrid
      files={[
        {
          key: "pic.jpg",
          size: 10,
          uploaded: "Wed, 20 Jun 2024 12:00:00 GMT",
          httpMetadata: { contentType: "image/jpeg" },
          customMetadata: { thumbnail: "abc123" },
        },
      ]}
      onCwdChange={jest.fn()}
      multiSelected={null}
      onMultiSelect={jest.fn()}
      view="grid"
      onSelectMany={jest.fn()}
    />
  );

  // 缩略图通过带认证的 fetch 异步加载，等它渲染为 <img>
  const img = await screen.findByAltText("pic.jpg");
  expect(img).toHaveAttribute("draggable", "false");
});

it("blocks native drag start inside the file grid", () => {
  render(<FileGrid {...baseProps} view="grid" />);
  const container = screen.getByTestId("file-grid");
  // fireEvent 返回 false 表示默认行为已被 preventDefault 阻止
  expect(fireEvent.dragStart(container)).toBe(false);
});
