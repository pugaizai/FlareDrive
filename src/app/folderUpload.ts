// 文件夹上传支持：拖拽目录树遍历 + 逐级创建目录（MKCOL）
import { webdavFetch } from "./auth";
import { encodeKey } from "../FileGrid";

export interface FolderUploadResult {
  files: File[];
  /** 需要创建的目录 key（相对路径，不含前导斜杠），按深度升序 */
  dirs: string[];
}

/**
 * 遍历拖拽的 DataTransferItem 列表，收集文件（带 webkitRelativePath）与目录。
 * 不支持 webkitGetAsEntry 的环境退化为仅返回顶层文件。
 */
export async function collectEntries(
  items: DataTransferItem[]
): Promise<FolderUploadResult> {
  const files: File[] = [];
  const dirs: string[] = [];

  const entries: FileSystemEntry[] = [];
  for (const item of items) {
    const entry = item.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }

  const walk = async (entry: FileSystemEntry, prefix: string) => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve) =>
        (entry as FileSystemFileEntry).file(resolve)
      );
      // 记录相对路径（含目录部分），供上传时定位 basedir
      Object.defineProperty(file, "webkitRelativePath", {
        value: prefix + file.name,
        configurable: true,
      });
      files.push(file);
    } else if (entry.isDirectory) {
      const dirKey = prefix + entry.name;
      dirs.push(dirKey);
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const readBatch = async () => {
        const batch = await new Promise<FileSystemEntry[]>((resolve) =>
          reader.readEntries(resolve)
        );
        if (batch.length > 0) {
          await Promise.all(batch.map((child) => walk(child, dirKey + "/")));
          await readBatch(); // readEntries 每次最多返回一部分
        }
      };
      await readBatch();
    }
  };

  await Promise.all(entries.map((entry) => walk(entry, "")));
  dirs.sort((a, b) => a.split("/").length - b.split("/").length);
  return { files, dirs };
}

/** 逐级创建目录（父目录必须先存在，故按深度升序） */
export async function ensureDirectories(dirs: string[], cwd: string) {
  for (const dir of dirs) {
    await webdavFetch(`/webdav/${encodeKey(cwd + dir)}`, {
      method: "MKCOL",
    }).catch(() => {
      // 已存在（405）或并发创建冲突等，忽略
    });
  }
}

/** 由 webkitRelativePath 计算该文件的 basedir（不含文件名的相对目录 + "/"） */
export function relativeBasedir(file: File, cwd: string) {
  return cwd + file.webkitRelativePath.slice(0, -file.name.length);
}
