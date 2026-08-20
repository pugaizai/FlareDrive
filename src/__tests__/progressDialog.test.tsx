// ProgressDialog：空状态、进行中进度、完成/失败图标
import { render, screen } from "@testing-library/react";
import React from "react";
import ProgressDialog from "../ProgressDialog";

const mockTasks: Array<Record<string, unknown>> = [];

jest.mock("../app/transferQueue", () => ({
  useTransferQueue: () => mockTasks,
  useUploadEnqueue: () => jest.fn(),
  TransferQueueProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

const task = (overrides: Record<string, unknown>) => ({
  type: "upload",
  status: "pending",
  remoteKey: "/a.txt",
  name: "a.txt",
  loaded: 0,
  total: 100,
  ...overrides,
});

beforeEach(() => {
  mockTasks.length = 0;
});

it("shows a placeholder when there are no tasks", () => {
  render(<ProgressDialog open onClose={jest.fn()} />);
  expect(screen.getByText("No tasks")).toBeTruthy();
});

it("shows in-progress tasks with size progress", () => {
  mockTasks.push(task({ status: "in-progress", loaded: 50, total: 100 }));
  render(<ProgressDialog open onClose={jest.fn()} />);
  expect(screen.getByText("a.txt")).toBeTruthy();
  expect(screen.getByText("50.0 B / 100.0 B")).toBeTruthy();
});

it("shows a check icon for completed tasks", () => {
  mockTasks.push(task({ status: "completed" }));
  render(<ProgressDialog open onClose={jest.fn()} />);
  expect(screen.getByTestId("CheckCircleOutlineIcon")).toBeTruthy();
});

it("shows an error icon for failed tasks", () => {
  mockTasks.push(task({ status: "failed", error: new Error("boom") }));
  render(<ProgressDialog open onClose={jest.fn()} />);
  expect(screen.getByTestId("ErrorOutlineIcon")).toBeTruthy();
});
