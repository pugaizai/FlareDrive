// ShareDialog：选择有效期生成分享链接 + 复制到剪贴板
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ShareDialog from "../ShareDialog";

const URL = "https://example.com/webdav/a.txt?token=exp.sig";

function renderDialog(onCreate = jest.fn().mockResolvedValue(URL)) {
  const onError = jest.fn();
  render(
    <ShareDialog
      open
      onClose={jest.fn()}
      onCreate={onCreate}
      onError={onError}
    />
  );
  return { onCreate, onError };
}

it("generates the link with the default ttl (1 day)", async () => {
  const { onCreate } = renderDialog();
  fireEvent.click(screen.getByRole("button", { name: "Generate link" }));
  await waitFor(() => expect(onCreate).toHaveBeenCalledWith(86400));
  expect(await screen.findByDisplayValue(URL)).toBeTruthy();
});

it("uses the picked option as the ttl", async () => {
  const { onCreate } = renderDialog();
  fireEvent.mouseDown(screen.getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", { name: "7 days" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate link" }));
  await waitFor(() => expect(onCreate).toHaveBeenCalledWith(604800));
});

it("reports generation errors and stays on the picker", async () => {
  const onCreate = jest.fn().mockRejectedValue(new Error("boom"));
  const { onError } = renderDialog(onCreate);
  fireEvent.click(screen.getByRole("button", { name: "Generate link" }));
  await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.any(Error)));
  expect(screen.queryByDisplayValue(URL)).toBeNull();
  expect(screen.getByRole("button", { name: "Generate link" })).toBeTruthy();
});

it("copies the generated URL to the clipboard and shows Copied", async () => {
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });

  renderDialog();
  fireEvent.click(screen.getByRole("button", { name: "Generate link" }));
  await screen.findByDisplayValue(URL);
  fireEvent.click(screen.getByRole("button", { name: "Copy" }));

  await waitFor(() => expect(writeText).toHaveBeenCalledWith(URL));
  expect(await screen.findByText("Copied")).toBeTruthy();
});
