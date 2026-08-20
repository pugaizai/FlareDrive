// AuthDialog：保存按钮状态、提交回调、Enter 提交
import { fireEvent, render, screen } from "@testing-library/react";
import AuthDialog from "../AuthDialog";

it("disables Save until a username is entered", () => {
  render(<AuthDialog open onClose={jest.fn()} onSave={jest.fn()} />);
  const save = screen.getByRole("button", { name: "Save" });
  expect(save).toBeDisabled();

  fireEvent.change(screen.getByLabelText("Username"), {
    target: { value: "user" },
  });
  expect(save).toBeEnabled();
});

it("calls onSave with the credentials", () => {
  const onSave = jest.fn();
  render(<AuthDialog open onClose={jest.fn()} onSave={onSave} />);

  fireEvent.change(screen.getByLabelText("Username"), {
    target: { value: "user" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "pass" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(onSave).toHaveBeenCalledWith("user", "pass");
});

it("submits when Enter is pressed in the password field", () => {
  const onSave = jest.fn();
  render(<AuthDialog open onClose={jest.fn()} onSave={onSave} />);

  fireEvent.change(screen.getByLabelText("Username"), {
    target: { value: "user" },
  });
  fireEvent.keyDown(screen.getByLabelText("Password"), { key: "Enter" });

  expect(onSave).toHaveBeenCalledWith("user", "");
});
