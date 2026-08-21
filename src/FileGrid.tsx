import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  Grid,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import ImageIcon from "@mui/icons-material/Image";
import MimeIcon from "./MimeIcon";
import { webdavFetch } from "./app/auth";
import { humanReadableSize } from "./app/utils";
import { ViewOption } from "./app/view";

export interface FileItem {
  key: string;
  size: number;
  uploaded: string;
  httpMetadata: { contentType: string };
  customMetadata?: { thumbnail?: string };
}

interface BoxRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function extractFilename(key: string) {
  return key.split("/").pop();
}

export function encodeKey(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

export function isDirectory(file: FileItem) {
  return file.httpMetadata?.contentType === "application/x-directory";
}

// <img> 标签无法携带 Authorization 头，缩略图通过带认证的 fetch 加载为 Blob
function Thumbnail({ digest, alt }: { digest: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    webdavFetch(
      `/webdav/_$flaredrive$/thumbnails/${encodeURIComponent(digest)}.png`
    )
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (!blob || cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [digest]);

  if (!src) return <ImageIcon fontSize="large" />;
  return (
    <img
      src={src}
      alt={alt}
      style={{ width: 36, height: 36, objectFit: "cover" }}
    />
  );
}

// 网格/列表共用的单行内容
function FileRow({
  file,
  multiSelected,
  boxKeys,
  onMultiSelect,
  onCwdChange,
  suppressClickRef,
}: {
  file: FileItem;
  multiSelected: string[] | null;
  boxKeys: string[];
  onMultiSelect: (key: string) => void;
  onCwdChange: (newCwd: string) => void;
  suppressClickRef: React.MutableRefObject<boolean>;
}) {
  // 预览走应用自己的认证（带 Authorization 头的 fetch → Blob → 新标签页），
  // 不再 window.open 直连 /webdav（那会触发浏览器原生 Basic Auth 弹窗）。
  const openFile = async () => {
    try {
      const res = await webdavFetch(`/webdav/${encodeKey(file.key)}`);
      if (!res.ok) return; // 401 时 webdavFetch 已通知登录弹窗
      const blob = await res.blob();
      // 新标签页在后台流式读取 blob，过早 revoke 会中断；交由页面生命周期回收
      window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
    } catch {
      // 忽略：网络错误等不打断用户操作
    }
  };

  return (
    <ListItemButton
      data-key={file.key}
      selected={
        multiSelected?.includes(file.key) || boxKeys.includes(file.key)
      }
      onClick={() => {
        // 框选拖拽结束后的残余 click 需要被吞掉，避免误打开文件
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }
        if (multiSelected !== null) {
          onMultiSelect(file.key);
        } else if (isDirectory(file)) {
          onCwdChange(file.key + "/");
        } else openFile();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onMultiSelect(file.key);
      }}
      sx={{ userSelect: "none" }}
    >
      <ListItemIcon>
        {file.customMetadata?.thumbnail ? (
          <Thumbnail digest={file.customMetadata.thumbnail} alt={file.key} />
        ) : (
          <MimeIcon contentType={file.httpMetadata.contentType} />
        )}
      </ListItemIcon>
      <ListItemText
        primary={extractFilename(file.key)}
        primaryTypographyProps={{
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
        secondary={
          <React.Fragment>
            <Box
              sx={{
                display: "inline-block",
                minWidth: "160px",
                marginRight: 1,
              }}
            >
              {new Date(file.uploaded).toLocaleString()}
            </Box>
            {!isDirectory(file) && humanReadableSize(file.size)}
          </React.Fragment>
        }
      />
    </ListItemButton>
  );
}

function FileGrid({
  files,
  onCwdChange,
  multiSelected,
  onMultiSelect,
  emptyMessage,
  view,
  onSelectMany,
}: {
  files: FileItem[];
  onCwdChange: (newCwd: string) => void;
  multiSelected: string[] | null;
  onMultiSelect: (key: string) => void;
  emptyMessage?: React.ReactNode;
  view: ViewOption;
  onSelectMany: (keys: string[]) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const suppressClickRef = useRef(false);
  const dragStart = useRef<{
    x: number;
    y: number;
    started: boolean;
    onRow: boolean;
  } | null>(null);
  const boxRef = useRef<BoxRect | null>(null);
  const [box, setBox] = useState<BoxRect | null>(null);
  const [boxKeys, setBoxKeys] = useState<string[]>([]);

  if (files.length === 0) return <>{emptyMessage}</>;

  const computeBoxKeys = (b: BoxRect): string[] => {
    const container = containerRef.current;
    if (!container) return [];
    const crect = container.getBoundingClientRect();
    const keys: string[] = [];
    container.querySelectorAll<HTMLElement>("[data-key]").forEach((el) => {
      const r = el.getBoundingClientRect();
      const left = r.left - crect.left;
      const right = r.right - crect.left;
      const top = r.top - crect.top;
      const bottom = r.bottom - crect.top;
      if (left < b.x2 && right > b.x1 && top < b.y2 && bottom > b.y1) {
        keys.push(el.dataset.key as string);
      }
    });
    return keys;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const container = containerRef.current;
    if (!container) return;
    const crect = container.getBoundingClientRect();
    const x = e.clientX - crect.left;
    const y = e.clientY - crect.top;
    const onRow = (e.target as HTMLElement).closest("[data-key]") !== null;
    dragStart.current = { x, y, started: false, onRow };

    const handleMove = (ev: MouseEvent) => {
      const start = dragStart.current;
      if (!start) return;
      const cx = ev.clientX - crect.left;
      const cy = ev.clientY - crect.top;
      if (!start.started && Math.hypot(cx - start.x, cy - start.y) > 4) {
        start.started = true;
      }
      if (!start.started) return;
      const b: BoxRect = {
        x1: Math.min(start.x, cx),
        y1: Math.min(start.y, cy),
        x2: Math.max(start.x, cx),
        y2: Math.max(start.y, cy),
      };
      boxRef.current = b;
      setBox(b);
      setBoxKeys(computeBoxKeys(b));
    };

    const handleUp = () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
      const start = dragStart.current;
      const lastBox = boxRef.current;
      dragStart.current = null;
      boxRef.current = null;
      setBox(null);
      setBoxKeys([]);
      if (start?.started) {
        // 吞掉拖拽结束后的残余 click
        suppressClickRef.current = true;
        setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
        if (lastBox) onSelectMany(computeBoxKeys(lastBox));
      } else if (start && !start.onRow) {
        // 空白处点击：清空选择（资源管理器风格）
        onSelectMany([]);
      }
    };

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  };

  const rowProps = (file: FileItem) => ({
    file,
    multiSelected,
    boxKeys,
    onMultiSelect,
    onCwdChange,
    suppressClickRef,
  });

  return (
    <Box
      ref={containerRef}
      data-testid="file-grid"
      sx={{ position: "relative", userSelect: box ? "none" : undefined }}
      onMouseDown={handleMouseDown}
    >
      {view === "list" ? (
        <List sx={{ paddingBottom: "48px" }}>
          {files.map((file) => (
            <FileRow key={file.key} {...rowProps(file)} />
          ))}
        </List>
      ) : (
        <Grid container sx={{ paddingBottom: "48px" }}>
          {files.map((file) => (
            <Grid item key={file.key} xs={12} sm={6} md={4} lg={3} xl={2}>
              <FileRow {...rowProps(file)} />
            </Grid>
          ))}
        </Grid>
      )}
      {box && (
        <Box
          sx={{
            position: "absolute",
            left: box.x1,
            top: box.y1,
            width: box.x2 - box.x1,
            height: box.y2 - box.y1,
            border: "1px solid",
            borderColor: "primary.main",
            backgroundColor: "primary.main",
            opacity: 0.15,
            pointerEvents: "none",
            zIndex: 5,
          }}
        />
      )}
    </Box>
  );
}

export default FileGrid;
