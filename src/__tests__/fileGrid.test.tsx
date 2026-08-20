// FileGrid：网格/列表两种视图渲染与空状态
import { render, screen } from "@testing-library/react";
import FileGrid, { FileItem } from "../FileGrid";

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
