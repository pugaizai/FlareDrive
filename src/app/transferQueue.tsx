import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { processTransferTask } from "./transfer";

export interface TransferTask {
  /** 队列内唯一 id（文件同名时作为稳定的 React key） */
  id: string;
  type: "upload" | "download";
  status: "pending" | "in-progress" | "completed" | "failed";
  remoteKey: string;
  file?: File;
  name: string;
  loaded: number;
  total: number;
  error?: any;
  /** 已尝试的次数（含当前这次），用于失败自动重试 */
  attempts?: number;
}

/** 单个任务失败后的最大尝试次数 */
const MAX_ATTEMPTS = 3;

/** 看门狗：任务持续无进度事件超过此时长视为卡死 */
const WATCHDOG_TIMEOUT_MS = 120_000;
/** 看门狗轮询间隔 */
const WATCHDOG_TICK_MS = 10_000;

const TransferQueueContext = createContext<TransferTask[]>([]);
const SetTransferQueueContext = createContext<
  React.Dispatch<React.SetStateAction<TransferTask[]>>
>(() => {});

export function useTransferQueue() {
  return useContext(TransferQueueContext);
}

function newTaskId() {
  // crypto.randomUUID 需要安全上下文；不可用时降级
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useUploadEnqueue() {
  const setTransferTasks = useContext(SetTransferQueueContext);
  return (...requests: { basedir: string; file: File }[]) => {
    const newTasks = requests.map(
      ({ basedir, file }) =>
        ({
          id: newTaskId(),
          type: "upload",
          status: "pending",
          name: file.name,
          file,
          remoteKey: basedir + file.name,
          loaded: 0,
          total: file.size,
        } as TransferTask)
    );
    setTransferTasks((tasks) => [...tasks, ...newTasks]);
  };
}

export function TransferQueueProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [transferTasks, setTransferTasks] = useState<TransferTask[]>([]);
  const taskProcessing = useRef<TransferTask | null>(null);
  const watchdog = useRef<{ timer: number; deadline: number } | null>(null);

  function updateCurrentTask(props: Partial<TransferTask>) {
    const currentTask = taskProcessing.current;
    if (!currentTask) return;
    // 同步更新 ref，并按对象引用在 state 中替换，保证后续更新能命中
    const newTask: TransferTask = { ...currentTask, ...props };
    taskProcessing.current = newTask;
    setTransferTasks((tasks) =>
      tasks.map((t) => (t === currentTask ? newTask : t))
    );
  }

  function clearWatchdog() {
    if (watchdog.current) {
      clearInterval(watchdog.current.timer);
      watchdog.current = null;
    }
  }

  useEffect(() => () => clearWatchdog(), []);

  useEffect(() => {
    const taskToProcess = transferTasks.find(
      (task) => task.status === "pending"
    );
    if (!taskToProcess || taskProcessing.current) return;
    taskProcessing.current = taskToProcess;

    updateCurrentTask({ status: "in-progress" });
    // 本次尝试的代号：attempts 在处理过程中不会被修改，只有重试/看门狗接管后
    // 才会 +1。用它区分"本次尝试的回调"与"旧尝试的迟到回调"。
    const startAttempts = taskToProcess.attempts ?? 0;

    watchdog.current = {
      timer: window.setInterval(() => {
        const state = watchdog.current;
        if (!state || Date.now() < state.deadline) return;
        clearWatchdog();
        const current = taskProcessing.current;
        // updateCurrentTask 会替换任务对象，必须按 id + attempts 比较
        if (current?.id !== taskToProcess.id) return;
        if ((current.attempts ?? 0) !== startAttempts) return;
        const attempts = startAttempts + 1;
        if (attempts < MAX_ATTEMPTS) {
          updateCurrentTask({
            status: "pending",
            attempts,
            loaded: 0,
            error: undefined,
          });
        } else {
          updateCurrentTask({
            status: "failed",
            attempts,
            error: new Error(
              `Task stalled: no progress for ${WATCHDOG_TIMEOUT_MS / 1000}s`
            ),
          });
        }
        taskProcessing.current = null;
      }, WATCHDOG_TICK_MS),
      deadline: Date.now() + WATCHDOG_TIMEOUT_MS,
    };

    processTransferTask({
      task: taskToProcess,
      onTaskProgress: ({ loaded }) => {
        // 有进度就续期看门狗
        if (watchdog.current) watchdog.current.deadline = Date.now() + WATCHDOG_TIMEOUT_MS;
        updateCurrentTask({ loaded });
      },
    })
      .then(() => {
        // 看门狗可能已接管该任务；updateCurrentTask 会替换任务对象，
        // 按 id + attempts 判断是否仍是本次尝试在处理
        const current = taskProcessing.current;
        if (current?.id !== taskToProcess.id) return;
        if ((current.attempts ?? 0) !== startAttempts) return;
        clearWatchdog();
        updateCurrentTask({ status: "completed" });
        // 必须清空，否则后续任务永远不会被处理
        taskProcessing.current = null;
      })
      .catch((error) => {
        const current = taskProcessing.current;
        if (current?.id !== taskToProcess.id) return;
        if ((current.attempts ?? 0) !== startAttempts) return;
        clearWatchdog();
        const attempts = startAttempts + 1;
        if (attempts < MAX_ATTEMPTS) {
          // 重试：恢复为 pending，让 effect 再次拾起该任务
          updateCurrentTask({
            status: "pending",
            attempts,
            loaded: 0,
            error: undefined,
          });
        } else {
          updateCurrentTask({ status: "failed", attempts, error });
        }
        taskProcessing.current = null;
      });
  }, [transferTasks]);

  return (
    <TransferQueueContext.Provider value={transferTasks}>
      <SetTransferQueueContext.Provider value={setTransferTasks}>
        {children}
      </SetTransferQueueContext.Provider>
    </TransferQueueContext.Provider>
  );
}
