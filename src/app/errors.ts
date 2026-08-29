// 带机器可读 code 的错误：message 保持英文（向后兼容，测试断言与日志
// 均可读），UI 层通过 translateError() 按 code 翻译为当前语言展示。
export type ErrorCode =
  | "fetchFailed"
  | "invalidResponse"
  | "invalidTask"
  | "invalidFolderName"
  | "createFolderFailed"
  | "transferFailed"
  | "deleteTimedOut"
  | "deleteFailed"
  | "networkError";

export interface AppError extends Error {
  code?: ErrorCode;
  params?: Record<string, string | number>;
  /** HTTP 状态码（例如重命名时依赖 412 判断“目标已存在”） */
  status?: number;
}

export function appError(
  code: ErrorCode,
  message: string,
  params?: Record<string, string | number>,
  status?: number
): AppError {
  const error = new Error(message) as AppError;
  error.code = code;
  error.params = params;
  error.status = status;
  return error;
}
