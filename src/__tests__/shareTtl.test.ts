// 分享有效期解析：ttl 参数优先，环境变量默认值兜底，一律钳制 1 小时 ~ 30 天
import {
  SHARE_TTL_MAX,
  SHARE_TTL_MIN,
  resolveShareTtl,
} from "../../functions/webdav/utils";

it("uses the env value as the default when no ttl param is given", () => {
  expect(resolveShareTtl(undefined, null)).toBe(86400);
  expect(resolveShareTtl("7200", null)).toBe(7200);
});

it("falls back to the default on an invalid env value", () => {
  expect(resolveShareTtl("abc", null)).toBe(86400);
  expect(resolveShareTtl("0", null)).toBe(86400);
  expect(resolveShareTtl("-5", null)).toBe(86400);
});

it("clamps the env default into the allowed range", () => {
  expect(resolveShareTtl("100", null)).toBe(SHARE_TTL_MIN);
  expect(resolveShareTtl("999999999", null)).toBe(SHARE_TTL_MAX);
});

it("prefers an explicit ttl param and clamps it", () => {
  expect(resolveShareTtl("7200", "3600")).toBe(SHARE_TTL_MIN);
  expect(resolveShareTtl("7200", "604800")).toBe(604800);
  expect(resolveShareTtl("7200", "100")).toBe(SHARE_TTL_MIN);
  expect(resolveShareTtl("7200", "999999999")).toBe(SHARE_TTL_MAX);
  expect(resolveShareTtl("7200", "5900.9")).toBe(5900);
});

it("rejects an invalid explicit ttl param", () => {
  expect(resolveShareTtl("7200", "abc")).toBeNull();
  expect(resolveShareTtl("7200", "0")).toBeNull();
  expect(resolveShareTtl("7200", "-1")).toBeNull();
  expect(resolveShareTtl("7200", "")).toBeNull();
});
