// 文件排序：目录置顶 + 名称/大小/修改时间排序
import { sortFiles } from "../app/sort";
import { FileItem } from "../FileGrid";

const item = (
  key: string,
  size: number,
  uploaded: string,
  dir = false
): FileItem => ({
  key,
  size,
  uploaded,
  httpMetadata: { contentType: dir ? "application/x-directory" : "text/plain" },
});

it("keeps directories first and sorts files by name ascending", () => {
  const files = [
    item("b.txt", 1, "2024-01-01"),
    item("a/", 0, "2024-01-01", true),
    item("a.txt", 1, "2024-01-01"),
  ];
  const sorted = sortFiles(files, "name-asc");
  expect(sorted.map((f) => f.key)).toEqual(["a/", "a.txt", "b.txt"]);
});

it("sorts by name descending within groups", () => {
  const files = [
    item("a.txt", 1, "2024-01-01"),
    item("b.txt", 1, "2024-01-01"),
    item("z/", 0, "2024-01-01", true),
  ];
  const sorted = sortFiles(files, "name-desc");
  expect(sorted.map((f) => f.key)).toEqual(["z/", "b.txt", "a.txt"]);
});

it("sorts by size descending, directories still first", () => {
  const files = [
    item("small.txt", 10, "2024-01-01"),
    item("big.txt", 100, "2024-01-01"),
    item("dir/", 0, "2024-01-01", true),
  ];
  const sorted = sortFiles(files, "size-desc");
  expect(sorted.map((f) => f.key)).toEqual(["dir/", "big.txt", "small.txt"]);
});

it("sorts by modification time newest first", () => {
  const files = [
    item("old.txt", 1, "2024-01-01"),
    item("new.txt", 1, "2024-06-01"),
    item("mid.txt", 1, "2024-03-01"),
  ];
  const sorted = sortFiles(files, "modified-desc");
  expect(sorted.map((f) => f.key)).toEqual(["new.txt", "mid.txt", "old.txt"]);
});

it("does not mutate the input array", () => {
  const files = [
    item("b.txt", 1, "2024-01-01"),
    item("a.txt", 1, "2024-01-01"),
  ];
  const original = [...files];
  sortFiles(files, "name-asc");
  expect(files.map((f) => f.key)).toEqual(original.map((f) => f.key));
});
