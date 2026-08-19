import React, { useEffect, useState } from "react";
import {
  Box,
  Grid,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import ImageIcon from "@mui/icons-material/Image";
import MimeIcon from "./MimeIcon";
import { webdavFetch } from "./app/auth";
import { humanReadableSize } from "./app/utils";

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

function FileGrid({
  files,
  onCwdChange,
  multiSelected,
  onMultiSelect,
  emptyMessage,
}: {
  files: FileItem[];
  onCwdChange: (newCwd: string) => void;
  multiSelected: string[] | null;
  onMultiSelect: (key: string) => void;
  emptyMessage?: React.ReactNode;
}) {
  return files.length === 0 ? (
    emptyMessage
  ) : (
    <Grid container sx={{ paddingBottom: "48px" }}>
      {files.map((file) => (
        <Grid item key={file.key} xs={12} sm={6} md={4} lg={3} xl={2}>
          <ListItemButton
            selected={multiSelected?.includes(file.key)}
            onClick={() => {
              if (multiSelected !== null) {
                onMultiSelect(file.key);
              } else if (isDirectory(file)) {
                onCwdChange(file.key + "/");
              } else
                window.open(
                  `/webdav/${encodeKey(file.key)}`,
                  "_blank",
                  "noopener,noreferrer"
                );
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              onMultiSelect(file.key);
            }}
            sx={{ userSelect: "none" }}
          >
            <ListItemIcon>
              {file.customMetadata?.thumbnail ? (
                <Thumbnail
                  digest={file.customMetadata.thumbnail}
                  alt={file.key}
                />
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
        </Grid>
      ))}
    </Grid>
  );
}

export default FileGrid;
