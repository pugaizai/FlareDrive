// 文件夹拖拽上传：目录树遍历的错误回调与系统文件过滤
import { collectEntries } from "../app/folderUpload";

const fileEntry = (name: string, fail = false) => ({
  isFile: true,
  isDirectory: false,
  name,
  file: (success: (f: File) => void, error: (e: unknown) => void) =>
    fail ? error(new Error("unreadable entry")) : success({ name } as File),
});

const wrap = (entry: unknown) =>
  ({ webkitGetAsEntry: () => entry } as unknown as DataTransferItem);

it("collects dropped top-level files", async () => {
  const { files, dirs } = await collectEntries([
    wrap(fileEntry("a.txt")),
    wrap(fileEntry("b.txt")),
  ]);
  expect(files.map((f) => f.name)).toEqual(["a.txt", "b.txt"]);
  expect(dirs).toEqual([]);
});

it("skips system metadata files (dotfiles / Thumbs.db / desktop.ini)", async () => {
  const names = [".DS_Store", "Thumbs.db", "desktop.ini", "notes.txt"];
  const { files } = await collectEntries(names.map((n) => wrap(fileEntry(n))));
  expect(files.map((f) => f.name)).toEqual(["notes.txt"]);
});

it("rejects when an entry cannot be read instead of hanging silently", async () => {
  // 此前 entry.file 的错误回调缺失，Promise 永不落定，拖拽流程无声挂起
  await expect(
    collectEntries([wrap(fileEntry("broken.bin", true))])
  ).rejects.toThrow("unreadable entry");
});
