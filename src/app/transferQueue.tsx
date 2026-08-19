import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { processTransferTask } from "./transfer";

export interface TransferTask {
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

const TransferQueueContext = createContext<TransferTask[]>([]);
const SetTransferQueueContext = createContext<
  React.Dispatch<React.SetStateAction<TransferTask[]>>
>(() => {});

export function useTransferQueue() {
  return useContext(TransferQueueContext);
}

export function useUploadEnqueue() {
  const setTransferTasks = useContext(SetTransferQueueContext);
  return (...requests: { basedir: string; file: File }[]) => {
    const newTasks = requests.map(
      ({ basedir, file }) =>
        ({
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

  useEffect(() => {
    const taskToProcess = transferTasks.find(
      (task) => task.status === "pending"
    );
    if (!taskToProcess || taskProcessing.current) return;
    taskProcessing.current = taskToProcess;

    updateCurrentTask({ status: "in-progress" });

    processTransferTask({
      task: taskToProcess,
      onTaskProgress: ({ loaded }) => {
        updateCurrentTask({ loaded });
      },
    })
      .then(() => {
        updateCurrentTask({ status: "completed" });
        // 必须清空，否则后续任务永远不会被处理
        taskProcessing.current = null;
      })
      .catch((error) => {
        const attempts = (taskToProcess.attempts ?? 0) + 1;
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
