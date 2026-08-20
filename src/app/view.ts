// 文件列表视图模式
export type ViewOption = "grid" | "list";

export const VIEW_OPTIONS: { value: ViewOption; label: string }[] = [
  { value: "grid", label: "Grid" },
  { value: "list", label: "List" },
];
