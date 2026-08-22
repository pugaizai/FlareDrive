// ConfirmDialog：替代 window.confirm 的应用内确认框（删除等破坏性操作）
import { fireEvent, render, screen } from "@testing-library/react";
import ConfirmDialog from "../ConfirmDialog";

it("renders the title and the (multi-line) message", () => {
  render(
    <ConfirmDialog
      open
      title="Delete"
      message="Delete the following file(s) permanently?\n\na.txt\nb.txt"
      onConfirm={jest.fn()}
      onClose={jest.fn()}
    />
  );

  expect(screen.getByRole("heading", { name: "Delete" })).toBeTruthy();
  // getByText 会规范化空白（\n 变空格），用正则匹配
  expect(
    screen.getByText(
      /Delete the following file\(s\) permanently\?.*a\.txt.*b\.txt/
    )
  ).toBeTruthy();
});

it("calls onConfirm when the confirm button is clicked", () => {
  const onConfirm = jest.fn();
  render(
    <ConfirmDialog
      open
      title="Delete"
      message="a.txt"
      onConfirm={onConfirm}
      onClose={jest.fn()}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  expect(onConfirm).toHaveBeenCalled();
});

it("calls onClose when cancelled", () => {
  const onClose = jest.fn();
  const onConfirm = jest.fn();
  render(
    <ConfirmDialog
      open
      title="Delete"
      message="a.txt"
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onClose).toHaveBeenCalled();
  expect(onConfirm).not.toHaveBeenCalled();
});
