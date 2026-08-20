// jest-dom 匹配器（toBeDisabled/toBeInTheDocument 等）
import "@testing-library/jest-dom";

// CRA 的 jest 环境（jsdom）不提供 fetch/Response/Headers 全局，
// 这里用最小实现补齐，仅满足本项目代码的用法。
// 若 Node 已注入（较新环境），则跳过。

class FakeHeaders {
  private map = new Map<string, string>();

  constructor(init?: Record<string, string> | [string, string][]) {
    if (!init) return;
    if (Array.isArray(init)) {
      for (const [k, v] of init) this.map.set(k.toLowerCase(), String(v));
    } else {
      for (const [k, v] of Object.entries(init))
        this.map.set(k.toLowerCase(), String(v));
    }
  }

  set(k: string, v: string) {
    this.map.set(k.toLowerCase(), String(v));
  }
  append(k: string, v: string) {
    this.map.set(k.toLowerCase(), String(v));
  }
  get(k: string) {
    return this.map.get(k.toLowerCase()) ?? null;
  }
  has(k: string) {
    return this.map.has(k.toLowerCase());
  }
  delete(k: string) {
    this.map.delete(k.toLowerCase());
  }
  forEach(cb: (value: string, key: string) => void) {
    this.map.forEach((value, key) => cb(value, key));
  }
  entries() {
    return this.map.entries();
  }
}

class FakeResponse {
  status: number;
  statusText: string;
  ok: boolean;
  headers: FakeHeaders;
  private body: string;

  constructor(body?: BodyInit | null, init?: ResponseInit) {
    this.body = body == null ? "" : String(body);
    this.status = init?.status ?? 200;
    this.statusText = "";
    this.ok = this.status >= 200 && this.status < 300;
    this.headers = new FakeHeaders(init?.headers as Record<string, string>);
  }

  async text() {
    return this.body;
  }

  async json() {
    return JSON.parse(this.body);
  }
}

if (typeof globalThis.Headers === "undefined") {
  // @ts-ignore
  globalThis.Headers = FakeHeaders;
}
if (typeof globalThis.Response === "undefined") {
  // @ts-ignore
  globalThis.Response = FakeResponse;
}

// jest 27 的 jsdom 环境通常不注入 crypto.subtle / TextEncoder（Node 全局），补齐。
// 注意：require 在 jest 的模块作用域可用，但不在 globalThis 上。
declare const require: (id: string) => any;

if (typeof globalThis.TextEncoder === "undefined") {
  const { TextEncoder, TextDecoder } = require("util");
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}
if (typeof (globalThis as { crypto?: Crypto }).crypto?.subtle === "undefined") {
  globalThis.crypto = require("crypto").webcrypto;
}
