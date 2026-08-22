// TextPadDrawer：文件名非法时显示应用内错误提示（替代 window.alert），不触发上传
import { fireEvent, render, screen } from "@testing-library/react";
import TextPadDrawer from "../TextPadDrawer";
import { TransferQueueProvider } from "../app/transferQueue";
import { webdavFetch } from "../app/auth";

jest.mock("../app/auth", () => ({
  webdavFetch: jest.fn(),
  createAuthHeaders: () => ({}),
  notifyUnauthorized: jest.fn(),
}));

// p-limit 是 ESM-only 包，jest 27 无法转换，用即时执行的简单实现替代
jest.mock("p-limit", () => (concurrency: number) => {
  const limiter = (fn: () => unknown) => fn();
  limiter.concurrency = concurrency;
  return limiter;
});

const renderDrawer = () =>
  render(
    <TransferQueueProvider>
      <TextPadDrawer open setOpen={jest.fn()} cwd="" onUpload={jest.fn()} />
    </TransferQueueProvider>
  );

it("shows an in-app error instead of a native alert for an invalid file name", () => {
  const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
  renderDrawer();

  fireEvent.change(screen.getByLabelText("Write your note..."), {
    target: { value: "hello" },
  });
  fireEvent.change(screen.getByLabelText("File Name"), {
    target: { value: "a/b" },
  });
  fireEvent.click(screen.getByRole("button", { name: /save & upload note/i }));

  expect(screen.getByText("Invalid file name")).toBeTruthy();
  expect(alertSpy).not.toHaveBeenCalled();
  // 非法文件名不会触发上传
  expect(webdavFetch).not.toHaveBeenCalled();
});

it("clears the error after editing the file name", () => {
  renderDrawer();

  fireEvent.change(screen.getByLabelText("Write your note..."), {
    target: { value: "hello" },
  });
  fireEvent.change(screen.getByLabelText("File Name"), {
    target: { value: "a/b" },
  });
  fireEvent.click(screen.getByRole("button", { name: /save & upload note/i }));
  expect(screen.getByText("Invalid file name")).toBeTruthy();

  fireEvent.change(screen.getByLabelText("File Name"), {
    target: { value: "ok.txt" },
  });
  expect(screen.queryByText("Invalid file name")).toBeNull();
});
