// PromptDialog：替代 window.prompt 的应用内输入框
import { fireEvent, render, screen } from "@testing-library/react";
import PromptDialog from "../PromptDialog";

it("disables OK until a value is entered", () => {
  render(
    <PromptDialog
      open
      title="Rename"
      label="New name"
      onSubmit={jest.fn()}
      onClose={jest.fn()}
    />
  );
  const ok = screen.getByRole("button", { name: "OK" });
  expect(ok).toBeDisabled();

  fireEvent.change(screen.getByLabelText("New name"), {
    target: { value: "b.txt" },
  });
  expect(ok).toBeEnabled();
});

it("submits the trimmed value", () => {
  const onSubmit = jest.fn();
  render(
    <PromptDialog
      open
      title="Rename"
      label="New name"
      onSubmit={onSubmit}
      onClose={jest.fn()}
    />
  );

  fireEvent.change(screen.getByLabelText("New name"), {
    target: { value: "  b.txt  " },
  });
  fireEvent.click(screen.getByRole("button", { name: "OK" }));

  expect(onSubmit).toHaveBeenCalledWith("b.txt");
});

it("submits on Enter with the initial value", () => {
  const onSubmit = jest.fn();
  render(
    <PromptDialog
      open
      title="Rename"
      label="New name"
      initialValue="a.txt"
      onSubmit={onSubmit}
      onClose={jest.fn()}
    />
  );

  fireEvent.keyDown(screen.getByLabelText("New name"), { key: "Enter" });
  expect(onSubmit).toHaveBeenCalledWith("a.txt");
});
