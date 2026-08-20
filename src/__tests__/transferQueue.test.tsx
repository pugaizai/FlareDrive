// 上传队列：失败重试 + 死锁回归测试
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { processTransferTask } from "../app/transfer";
import {
  TransferQueueProvider,
  TransferTask,
  useTransferQueue,
  useUploadEnqueue,
} from "../app/transferQueue";

jest.mock("../app/transfer", () => ({
  processTransferTask: jest.fn(),
}));

const mockProcess = processTransferTask as jest.Mock;
const fakeFile = { name: "a.txt", size: 10 } as unknown as File;

let tasks: TransferTask[] = [];

function Probe() {
  tasks = useTransferQueue();
  const enqueue = useUploadEnqueue();
  return (
    <button onClick={() => enqueue({ basedir: "/", file: fakeFile })}>
      add
    </button>
  );
}

function renderQueue() {
  return render(
    <TransferQueueProvider>
      <Probe />
    </TransferQueueProvider>
  );
}

beforeEach(() => {
  tasks = [];
  mockProcess.mockReset();
});

it("retries a transient failure and completes", async () => {
  mockProcess
    .mockRejectedValueOnce(new Error("boom"))
    .mockResolvedValueOnce(undefined as never);
  renderQueue();

  fireEvent.click(screen.getByText("add"));

  await waitFor(() => expect(tasks[0]?.status).toBe("completed"));
  expect(mockProcess).toHaveBeenCalledTimes(2);
  expect(tasks[0].attempts).toBe(1);
});

it("marks a task failed after exhausting retries, then keeps processing later tasks (deadlock regression)", async () => {
  mockProcess.mockRejectedValue(new Error("boom"));
  renderQueue();

  // 第一个任务永远失败 → 3 次尝试后 failed
  fireEvent.click(screen.getByText("add"));
  await waitFor(() => expect(tasks[0]?.status).toBe("failed"));
  expect(tasks[0].attempts).toBe(3);

  // 死锁回归：失败后队列仍必须继续处理后续任务（原实现会卡死在这里）
  mockProcess.mockResolvedValue(undefined as never);
  fireEvent.click(screen.getByText("add"));
  await waitFor(() => expect(tasks[1]?.status).toBe("completed"));
  expect(mockProcess).toHaveBeenCalledTimes(4); // task1 ×3 次 + task2 ×1 次
});
