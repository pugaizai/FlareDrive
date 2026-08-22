// 文件列表视图模式
import type { TranslationKey } from "../i18n/translations";

export type ViewOption = "grid" | "list";

export const VIEW_OPTIONS: { value: ViewOption; labelKey: TranslationKey }[] = [
  { value: "grid", labelKey: "view.grid" },
  { value: "list", labelKey: "view.list" },
];
