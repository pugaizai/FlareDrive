// ShareDialog：展示分享链接 + 复制到剪贴板（替代 window.prompt）
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ShareDialog from "../ShareDialog";

const URL = "https://example.com/webdav/a.txt?token=exp.sig";

it("shows the share URL", () => {
  render(<ShareDialog open url={URL} onClose={jest.fn()} />);
  expect(screen.getByDisplayValue(URL)).toBeTruthy();
});

it("copies the URL to the clipboard and shows Copied", async () => {
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });

  render(<ShareDialog open url={URL} onClose={jest.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Copy" }));

  await waitFor(() => expect(writeText).toHaveBeenCalledWith(URL));
  expect(await screen.findByText("Copied")).toBeTruthy();
});
