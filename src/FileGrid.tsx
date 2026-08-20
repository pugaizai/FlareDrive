import React, { useEffect, useState } from "react";
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
  onMultiSelect,
  onCwdChange,
}: {
  file: FileItem;
  multiSelected: string[] | null;
  onMultiSelect: (key: string) => void;
  onCwdChange: (newCwd: string) => void;
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
      selected={multiSelected?.includes(file.key)}
      onClick={() => {
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
}: {
  files: FileItem[];
  onCwdChange: (newCwd: string) => void;
  multiSelected: string[] | null;
  onMultiSelect: (key: string) => void;
  emptyMessage?: React.ReactNode;
  view: ViewOption;
}) {
  if (files.length === 0) return <>{emptyMessage}</>;

  if (view === "list") {
    return (
      <List sx={{ paddingBottom: "48px" }}>
        {files.map((file) => (
          <FileRow
            key={file.key}
            file={file}
            multiSelected={multiSelected}
            onMultiSelect={onMultiSelect}
            onCwdChange={onCwdChange}
          />
        ))}
      </List>
    );
  }

  return (
    <Grid container sx={{ paddingBottom: "48px" }}>
      {files.map((file) => (
        <Grid item key={file.key} xs={12} sm={6} md={4} lg={3} xl={2}>
          <FileRow
            file={file}
            multiSelected={multiSelected}
            onMultiSelect={onMultiSelect}
            onCwdChange={onCwdChange}
          />
        </Grid>
      ))}
    </Grid>
  );
}

export default FileGrid;
