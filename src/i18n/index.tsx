// i18n 运行时：语言检测、持久化、<html lang> 同步，以及
// useI18n() / translateError() 供组件使用。
// 注意：在没有 I18nProvider 时 useI18n() 回退到英文（单元测试直接渲染
// 组件时无需包裹 Provider 也能工作，默认文案与原先一致）。
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { AppError } from "../app/errors";
import {
  DICTIONARIES,
  interpolate,
  Locale,
  Translation,
  TranslationKey,
} from "./translations";

export type { Locale, TranslationKey } from "./translations";

export type TFunction = (
  key: TranslationKey,
  params?: Record<string, string | number | undefined>
) => string;

export interface I18nContextValue {
  t: TFunction;
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

/** 顶栏语言切换菜单的选项（使用各自语言的原生名称） */
export const LOCALES: { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "zh-CN", label: "简体中文" },
  { value: "zh-TW", label: "繁體中文" },
];

const STORAGE_KEY = "flaredrive.locale";

function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "zh-CN" || value === "zh-TW";
}

/** 初始语言：优先 localStorage 中保存的选择，其次按浏览器语言自动识别 */
function getInitialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && isLocale(saved)) return saved;
  } catch {
    // localStorage 不可用时忽略
  }
  const language =
    (typeof navigator !== "undefined" ? navigator.language : "") || "en";
  const normalized = language.toLowerCase().replace("_", "-");
  if (normalized.startsWith("zh")) {
    if (
      normalized.startsWith("zh-tw") ||
      normalized.startsWith("zh-hk") ||
      normalized.startsWith("zh-mo")
    )
      return "zh-TW";
    return "zh-CN";
  }
  return "en";
}

function makeT(dict: Translation): TFunction {
  return (key, params) => interpolate(dict[key], params);
}

const I18nContext = createContext<I18nContextValue | null>(null);

/** 无 Provider 时的回退（英文），保证直接渲染组件的单元测试不受影响 */
const DEFAULT_CONTEXT: I18nContextValue = {
  t: makeT(DICTIONARIES.en),
  locale: "en",
  setLocale: () => {},
};

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  // 同步 <html lang> 并持久化用户选择
  useEffect(() => {
    document.documentElement.lang = locale;
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // 忽略持久化失败
    }
  }, [locale]);

  const t = useMemo(() => makeT(DICTIONARIES[locale]), [locale]);
  const setLocale = useCallback((next: Locale) => setLocaleState(next), []);
  const value = useMemo<I18nContextValue>(
    () => ({ t, locale, setLocale }),
    [t, locale, setLocale]
  );

  return (
    <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  return ctx ?? DEFAULT_CONTEXT;
}

/** 把应用逻辑抛出的错误翻译为当前语言；无 code 时回退到原始 message */
export function translateError(error: unknown, t: TFunction): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as AppError).code === "string"
  ) {
    const { code, params } = error as AppError;
    switch (code) {
      case "fetchFailed":
        return t("error.fetchFailed");
      case "invalidResponse":
        return t("error.invalidResponse");
      case "invalidTask":
        return t("error.invalidTask");
      case "invalidFolderName":
        return t("error.invalidFolderName");
      case "createFolderFailed":
        return t("error.createFolderFailed", { status: params?.status });
      case "transferFailed":
        return t("error.transferFailed", {
          action: t(
            params?.action === "move" ? "error.actionMove" : "error.actionCopy"
          ),
          status: params?.status,
        });
      case "deleteTimedOut":
        return t("error.deleteTimedOut", {
          attempts: params?.attempts,
          path: params?.path,
        });
      case "deleteFailed":
        return t("error.deleteFailed", {
          path: params?.path,
          status: params?.status,
        });
      default:
        break;
    }
  }
  return error instanceof Error ? error.message : String(error);
}
