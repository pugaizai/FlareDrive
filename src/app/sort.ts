// 文件列表排序：目录始终置顶，组内按所选条件排序
import { FileItem, isDirectory } from "../FileGrid";

export type SortOption =
  | "name-asc"
  | "name-desc"
  | "size-asc"
  | "size-desc"
  | "modified-asc"
  | "modified-desc";

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "name-asc", label: "Name (A→Z)" },
  { value: "name-desc", label: "Name (Z→A)" },
  { value: "size-desc", label: "Size (largest first)" },
  { value: "size-asc", label: "Size (smallest first)" },
  { value: "modified-desc", label: "Modified (newest first)" },
  { value: "modified-asc", label: "Modified (oldest first)" },
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
