// Main.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Breadcrumbs,
  Button,
  CircularProgress,
  Link,
  Typography,
} from "@mui/material";
import { Home as HomeIcon, NoteAdd as NoteAddIcon } from "@mui/icons-material";

import FileGrid, { encodeKey, FileItem } from "./FileGrid";
import ConfirmDialog from "./ConfirmDialog";
import MultiSelectToolbar from "./MultiSelectToolbar";
import PromptDialog from "./PromptDialog";
import ShareDialog from "./ShareDialog";
import UploadDrawer, { UploadFab } from "./UploadDrawer";
import TextPadDrawer from "./TextPadDrawer";
import { subscribeAuthChanged, webdavFetch } from "./app/auth";
import {
  collectEntries,
  ensureDirectories,
  relativeBasedir,
} from "./app/folderUpload";
import { copyPaste, deletePaths, fetchPath } from "./app/transfer";
import { SortOption, sortFiles } from "./app/sort";
import { useTransferQueue, useUploadEnqueue } from "./app/transferQueue";
import { ViewOption } from "./app/view";
import { useI18n } from "./i18n";

// Centered helper
function Centered({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100%",
      }}
    >
      {children}
    </Box>
  );
}

// Breadcrumb component
function PathBreadcrumb({
  path,
  onCwdChange,
}: {
  path: string;
  onCwdChange: (newCwd: string) => void;
}) {
  const parts = path.replace(/\/$/, "").split("/");

  return (
    <Breadcrumbs separator="›" sx={{ padding: 1 }}>
      <Button onClick={() => onCwdChange("")} sx={{ minWidth: 0, padding: 0 }}>
        <HomeIcon />
      </Button>
      {parts.map((part, index) =>
        index === parts.length - 1 ? (
          <Typography key={index} color="text.primary">
            {part}
          </Typography>
        ) : (
          <Link
            key={index}
            component="button"
            onClick={() => {
              onCwdChange(parts.slice(0, index + 1).join("/") + "/");
            }}
          >
            {part}
          </Link>
        )
      )}
    </Breadcrumbs>
  );
}

// DropZone wrapper
function DropZone({
  children,
  onDrop,
}: {
  children: React.ReactNode;
  onDrop: (event: React.DragEvent) => void;
}) {
  const [dragging, setDragging] = useState(false);

  return (
    <Box
      sx={{
        flexGrow: 1,
        overflowY: "auto",
        backgroundColor: (theme) => theme.palette.background.default,
        filter: dragging ? "brightness(0.9)" : "none",
        transition: "filter 0.2s",
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(e);
        setDragging(false);
      }}
    >
      {children}
    </Box>
  );
}

// Main Component
function Main({
  search,
  onError,
  sort,
  view,
}: {
  search: string;
  onError: (error: Error) => void;
  sort: SortOption;
  view: ViewOption;
}) {
  const [cwd, setCwd] = useState("");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [multiSelected, setMultiSelected] = useState<string[] | null>(null);
  const [showUploadDrawer, setShowUploadDrawer] = useState(false);
  const [showTextPadDrawer, setShowTextPadDrawer] = useState(false);
  const [lastUploadKey, setLastUploadKey] = useState<string | null>(null);
  const [renameKey, setRenameKey] = useState<string | null>(null);
  const [sharePath, setSharePath] = useState<string | null>(null);
  // 待确认删除的 key 列表（null = 对话框关闭）；确认后执行 deletePaths
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);

  const transferQueue = useTransferQueue();
  const uploadEnqueue = useUploadEnqueue();
  const { t } = useI18n();

  const fetchSeqRef = useRef(0);
  const fetchFiles = useCallback(() => {
    // 序号守卫：快速切换目录时，旧目录的 PROPFIND 可能后返回；
    // 无守卫时旧响应会覆盖新列表（且可能在别的目录里误删旧目录的文件）
    const seq = ++fetchSeqRef.current;
    fetchPath(cwd)
      .then((files) => {
        if (seq !== fetchSeqRef.current) return;
        setFiles(files);
        setMultiSelected(null);
      })
      .catch((error) => {
        // 被取代的请求不再报错，避免错误提示闪现
        if (seq === fetchSeqRef.current) onError(error);
      })
      .finally(() => {
        if (seq === fetchSeqRef.current) setLoading(false);
      });
  }, [cwd, onError]);

  // ---- cwd ↔ location.hash 同步：刷新不丢路径，支持前进/后退 ----
  const firstRender = useRef(true);

  useEffect(() => {
    const readHash = () => {
      let raw = "";
      try {
        raw = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        raw = "";
      }
      raw = raw.replace(/^\/?/, ""); // 兼容 "#/dir/" 与 "#dir/"
      setCwd(raw ? raw.replace(/\/$/, "") + "/" : "");
    };
    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, []);

  useEffect(() => {
    if (firstRender.current) {
      // 首次渲染由 hash 决定 cwd，不反向写回
      firstRender.current = false;
      return;
    }
    let current = "";
    try {
      current = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      current = "";
    }
    if (current !== cwd) window.location.hash = encodeKey(cwd);
    // 按 path 段编码写入（encodeKey），读取侧 decodeURIComponent 才能无损往返：
    // 直接写入原始路径时，名字含 % 的目录（如 "100%"）会让解码抛错并弹回根目录
  }, [cwd]);

  useEffect(() => setLoading(true), [cwd]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // 保存/清除凭据后自动刷新文件列表
  useEffect(() => subscribeAuthChanged(() => fetchFiles()), [fetchFiles]);

  useEffect(() => {
    if (!transferQueue.length) return;
    const lastFile = transferQueue[transferQueue.length - 1];
    if (["pending", "in-progress"].includes(lastFile.status)) {
      setLastUploadKey(lastFile.remoteKey);
    } else if (lastUploadKey) {
      fetchFiles();
      setLastUploadKey(null);
    }
  }, [cwd, fetchFiles, lastUploadKey, transferQueue]);

  const filteredFiles = useMemo(
    () =>
      sortFiles(
        search
          ? files.filter((file) =>
              file.key.toLowerCase().includes(search.toLowerCase())
            )
          : files,
        sort
      ),
    [files, search, sort]
  );

  const handleMultiSelect = useCallback((key: string) => {
    setMultiSelected((prev) => {
      if (prev === null) return [key];
      if (prev.includes(key)) {
        const updated = prev.filter((k) => k !== key);
        return updated.length ? updated : null;
      }
      return [...prev, key];
    });
  }, []);

  return (
    <>
      {cwd && <PathBreadcrumb path={cwd} onCwdChange={setCwd} />}

      {loading ? (
        <Centered>
          <CircularProgress />
        </Centered>
      ) : (
      <DropZone
        onDrop={async (event) => {
          try {
            const items = Array.from(event.dataTransfer.items);
            const hasEntries = items.some((item) => item.webkitGetAsEntry);
            if (hasEntries) {
              // 拖入文件夹：遍历目录树，先建目录再入队
              const { files, dirs } = await collectEntries(items);
              await ensureDirectories(dirs, cwd);
              uploadEnqueue(
                ...files.map((file) => ({
                  file,
                  basedir: relativeBasedir(file, cwd),
                }))
              );
            } else {
              uploadEnqueue(
                ...Array.from(event.dataTransfer.files).map((file) => ({
                  file,
                  basedir: cwd,
                }))
              );
            }
          } catch (error) {
            // 目录树遍历失败等此前会无声挂起，现在提示用户
            onError(error as Error);
          }
        }}
      >
          <FileGrid
            files={filteredFiles}
            onCwdChange={(newCwd: string) => setCwd(newCwd)}
            multiSelected={multiSelected}
            onMultiSelect={handleMultiSelect}
            emptyMessage={<Centered>{t("main.empty")}</Centered>}
            view={view}
            onSelectMany={(keys) =>
              setMultiSelected(keys.length ? keys : null)
            }
          />
        </DropZone>
      )}

      {multiSelected === null && (
        <>
          <UploadFab onClick={() => setShowUploadDrawer(true)} />
          <Button
            variant="contained"
            startIcon={<NoteAddIcon />}
            sx={{
              position: "fixed",
              bottom: 90,
              right: 24,
              zIndex: 999,
            }}
            onClick={() => setShowTextPadDrawer(true)}
          >
            {t("main.openTextPad")}
          </Button>
        </>
      )}

      <UploadDrawer
        open={showUploadDrawer}
        setOpen={setShowUploadDrawer}
        cwd={cwd}
        onUpload={fetchFiles}
        onError={onError}
      />

      <TextPadDrawer
        open={showTextPadDrawer}
        setOpen={setShowTextPadDrawer}
        cwd={cwd}
        onUpload={fetchFiles}
      />

      <MultiSelectToolbar
        multiSelected={multiSelected}
        onClose={() => setMultiSelected(null)}
        onDownload={async () => {
          if (multiSelected?.length !== 1) return;
          const key = multiSelected[0];
          try {
            const res = await webdavFetch(`/webdav/${encodeKey(key)}`);
            if (!res.ok) throw new Error(t("main.downloadFailed"));
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = key.split("/").pop()!;
            a.click();
            // 立即 revoke 会中断 Firefox 等浏览器的异步下载，延迟回收
            setTimeout(() => URL.revokeObjectURL(url), 10_000);
          } catch (error) {
            // 此前 async 处理器的异常无人接住，下载失败时界面毫无反馈
            onError(error as Error);
          }
        }}
        onRename={() => {
          if (multiSelected?.length !== 1) return;
          setRenameKey(multiSelected[0]);
        }}
        onDelete={() => {
          if (!multiSelected?.length) return;
          // 打开应用内确认对话框（替代浏览器原生 window.confirm）
          setConfirmDelete(multiSelected);
        }}
        onShare={() => {
          // 打开分享对话框，由用户选好有效期后再生成签名分享链接
          if (multiSelected?.length !== 1) return;
          setSharePath(multiSelected[0]);
        }}
      />

      <PromptDialog
        open={renameKey !== null}
        title={t("main.renameTitle")}
        label={t("main.newNameLabel")}
        initialValue={renameKey ? renameKey.split("/").pop() : ""}
        onSubmit={async (newName) => {
          const source = renameKey;
          setRenameKey(null);
          if (!source) return;
          try {
            // Overwrite: F —— 目标已存在时服务端返回 412，绝不静默覆盖
            await copyPaste(source, cwd + newName, true, true);
          } catch (error) {
            if ((error as { status?: number })?.status === 412) {
              onError(new Error(t("main.renameExists", { name: newName })));
            } else {
              onError(error as Error);
            }
            return;
          }
          fetchFiles();
        }}
        onClose={() => setRenameKey(null)}
      />

      <ShareDialog
        open={sharePath !== null}
        onClose={() => setSharePath(null)}
        onCreate={async (ttlSeconds: number) => {
          if (sharePath === null) return "";
          // 由服务端生成签名分享链接（需配置 WEBDAV_SHARE_SECRET），有效期可选
          const res = await webdavFetch(
            `/webdav/${encodeKey(sharePath)}?share&ttl=${ttlSeconds}`
          );
          if (res.status === 503) throw new Error(t("main.shareNotEnabled"));
          if (!res.ok)
            throw new Error(t("main.shareUnavailable", { status: res.status }));
          const { url } = (await res.json()) as { url: string };
          return url;
        }}
        onError={onError}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        title={t("main.deleteTitle")}
        message={
          confirmDelete
            ? t("main.deleteMessage", {
                list: confirmDelete
                  .map((key) => key.replace(/\/$/, "").split("/").pop())
                  .join("\n"),
              })
            : undefined
        }
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          const keys = confirmDelete;
          setConfirmDelete(null);
          if (!keys?.length) return;
          try {
            // 目录删除是分批的：服务端 503 + Retry-After 时内部自动重试直至完成
            await deletePaths(keys);
          } catch (error) {
            onError(error as Error);
          } finally {
            // 部分删除成功后也要刷新，避免残留对象不显示
            fetchFiles();
          }
        }}
      />
    </>
  );
}

export default Main;
