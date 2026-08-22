// 文件列表排序：目录始终置顶，组内按所选条件排序
import type { TranslationKey } from "../i18n/translations";
import { FileItem, isDirectory } from "../FileGrid";

export type SortOption =
  | "name-asc"
  | "name-desc"
  | "size-asc"
  | "size-desc"
  | "modified-asc"
  | "modified-desc";

export const SORT_OPTIONS: { value: SortOption; labelKey: TranslationKey }[] = [
  { value: "name-asc", labelKey: "sort.nameAsc" },
  { value: "name-desc", labelKey: "sort.nameDesc" },
  { value: "size-desc", labelKey: "sort.sizeDesc" },
  { value: "size-asc", labelKey: "sort.sizeAsc" },
  { value: "modified-desc", labelKey: "sort.modifiedDesc" },
  { value: "modified-asc", labelKey: "sort.modifiedAsc" },
];

const dateOf = (file: FileItem) => new Date(file.uploaded).getTime();

function compareBy(sort: SortOption) {
  return (a: FileItem, b: FileItem) => {
    switch (sort) {
      case "name-asc":
        return a.key.localeCompare(b.key);
      case "name-desc":
        return b.key.localeCompare(a.key);
      case "size-asc":
        return a.size - b.size;
      case "size-desc":
        return b.size - a.size;
      case "modified-asc":
        return dateOf(a) - dateOf(b);
      case "modified-desc":
        return dateOf(b) - dateOf(a);
    }
  };
}

/** 目录置顶 + 组内按 sort 排序（不修改入参） */
export function sortFiles(files: FileItem[], sort: SortOption): FileItem[] {
  const dirs = files.filter(isDirectory);
  const others = files.filter((file) => !isDirectory(file));
  const compare = compareBy(sort);
  dirs.sort(compare);
  others.sort(compare);
  return [...dirs, ...others];
}
