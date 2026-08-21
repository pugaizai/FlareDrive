// WebDAV Basic Auth 支持。
// 凭据保存在 localStorage，所有 /webdav 请求显式携带 Authorization 头，
// 不再依赖浏览器对 401 的隐式认证缓存（fetch/XHR 不会弹出登录框）。

const AUTH_STORAGE_KEY = "flaredrive.credentials";
const AUTH_CHANGED_EVENT = "flaredrive:auth-changed";

export interface Credentials {
  username: string;
  password: string;
}

export function getCredentials(): Credentials | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.username === "string" &&
      typeof parsed?.password === "string"
    )
      return { username: parsed.username, password: parsed.password };
    return null;
  } catch {
    return null;
  }
}

export function saveCredentials(credentials: Credentials) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(credentials));
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function clearCredentials() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

/** 监听凭据变化（保存/清除），返回取消订阅函数 */
export function subscribeAuthChanged(listener: () => void) {
  window.addEventListener(AUTH_CHANGED_EVENT, listener);
  return () => window.removeEventListener(AUTH_CHANGED_EVENT, listener);
}

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

/** 订阅 401 事件（通常用于弹出登录对话框），返回取消订阅函数 */
export function subscribeUnauthorized(listener: UnauthorizedListener) {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

export function notifyUnauthorized() {
  unauthorizedListeners.forEach((listener) => listener());
}

// UTF-8 安全的 Base64（btoa 只支持 Latin-1，用户名/密码可能含中文等字符）
function toBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function createAuthHeaders(): Record<string, string> {
  const credentials = getCredentials();
  if (!credentials) return {};
  return {
    Authorization: `Basic ${toBase64(
      `${credentials.username}:${credentials.password}`
    )}`,
  };
}

/**
 * 带 Basic Auth 的 fetch。遇到 401 时通知订阅者（UI 弹出登录框）。
 * 所有 /webdav 请求都应通过这里发起。
 */
export async function webdavFetch(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(createAuthHeaders()))
    headers.set(key, value);
  // 标记为网页端请求：服务端对这类 401 不下发 WWW-Authenticate，
  // 避免浏览器（尤其 Firefox）对 fetch 401 弹原生登录框。
  headers.set("X-FlareDrive-Web", "1");
  const response = await fetch(input, { ...init, headers });
  if (response.status === 401) notifyUnauthorized();
  return response;
}
