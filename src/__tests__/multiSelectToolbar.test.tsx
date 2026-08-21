// MultiSelectToolbar：二级菜单在操作/选择变化后必须关闭（残留弹开回归）
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import MultiSelectToolbar from "../MultiSelectToolbar";

const baseProps = {
  onClose: jest.fn(),
  onDownload: jest.fn(),
  onRename: jest.fn(),
  onDelete: jest.fn(),
  onShare: jest.fn(),
};

it("opens the More menu and closes it when an action is clicked", async () => {
  render(<MultiSelectToolbar multiSelected={["a.txt"]} {...baseProps} />);

  fireEvent.click(screen.getByRole("button", { name: "More" }));
  expect(screen.getByText("Rename")).toBeTruthy();

  fireEvent.click(screen.getByText("Rename"));
  expect(baseProps.onRename).toHaveBeenCalled();
  // 菜单有退出动画，等待其从 DOM 移除
  await waitFor(() => expect(screen.queryByText("Share")).toBeNull());
});

it("does not leave the menu open after selection is cleared and re-selected", () => {
  const { rerender } = render(
    <MultiSelectToolbar multiSelected={["a.txt"]} {...baseProps} />
  );

  // 打开菜单
  fireEvent.click(screen.getByRole("button", { name: "More" }));
  expect(screen.getByText("Rename")).toBeTruthy();

  // 操作完成 → 选择被清空
  rerender(<MultiSelectToolbar multiSelected={null} {...baseProps} />);

  // 再次选中 → 菜单必须处于关闭状态
  rerender(<MultiSelectToolbar multiSelected={["a.txt"]} {...baseProps} />);
  expect(screen.queryByText("Rename")).toBeNull();
  expect(screen.queryByText("Share")).toBeNull();
});
