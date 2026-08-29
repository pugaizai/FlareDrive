// 上传队列：失败重试 + 死锁回归测试 + 看门狗
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

it("watchdog unblocks the queue when a task promise never settles", async () => {
  jest.useFakeTimers();
  try {
    // 永不落定的 Promise（此前损坏图片的缩略图生成就是这样）会卡死整个队列
    mockProcess.mockImplementation(() => new Promise(() => {}));
    renderQueue();
    fireEvent.click(screen.getByText("add"));

    const advance = async (ms: number) => {
      await act(async () => {
        jest.advanceTimersByTime(ms);
      });
    };
    // 每次尝试等看门狗超时（120s）+ 一个轮询周期，3 次尝试后标记失败
    await advance(130_000);
    await advance(130_000);
    await advance(130_000);

    expect(tasks[0]?.status).toBe("failed");
    expect(tasks[0].attempts).toBe(3);
    expect(mockProcess).toHaveBeenCalledTimes(3);

    // 队列未被卡死：后续任务正常处理
    mockProcess.mockResolvedValue(undefined as never);
    fireEvent.click(screen.getByText("add"));
    await advance(0);
    expect(tasks[1]?.status).toBe("completed");
  } finally {
    jest.useRealTimers();
  }
});
