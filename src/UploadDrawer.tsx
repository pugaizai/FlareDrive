import React, { forwardRef, useCallback, useMemo, useState } from "react";

import { Button, Card, Drawer, Fab, Grid, Typography } from "@mui/material";
import {
  Camera as CameraIcon,
  CreateNewFolder as CreateNewFolderIcon,
  Folder as FolderIcon,
  Image as ImageIcon,
  Upload as UploadIcon,
} from "@mui/icons-material";
import PromptDialog from "./PromptDialog";
import { createFolderAt } from "./app/transfer";
import {
  ensureDirectories,
  relativeBasedir,
} from "./app/folderUpload";
import { useUploadEnqueue } from "./app/transferQueue";
import { useI18n } from "./i18n";

function IconCaptionButton({
  icon,
  caption,
  onClick,
}: {
  icon: React.ReactNode;
  caption: string;
  onClick?: () => void;
}) {
  return (
    <Button
      color="inherit"
      sx={{ width: "100%", display: "flex", flexDirection: "column" }}
      onClick={onClick}
    >
      {icon}
      <Typography
        variant="caption"
        sx={{ textTransform: "none", textWrap: "nowrap" }}
      >
        {caption}
      </Typography>
    </Button>
  );
}

export const UploadFab = forwardRef<HTMLButtonElement, { onClick: () => void }>(
  function UploadFab({ onClick }, ref) {
    const { t } = useI18n();
    return (
      <Fab
        ref={ref}
        aria-label={t("upload.upload")}
        variant="circular"
        color="primary"
        size="large"
        sx={{ position: "fixed", right: 16, bottom: 16, color: "white" }}
        onClick={onClick}
      >
        <UploadIcon fontSize="large" />
      </Fab>
    );
  }
);

function UploadDrawer({
  open,
  setOpen,
  cwd,
  onUpload,
  onError,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  cwd: string;
  onUpload: () => void;
  onError: (error: Error) => void;
}) {
  const { t } = useI18n();
  const uploadEnqueue = useUploadEnqueue();
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);

  const handleCreateFolder = async (folderName: string) => {
    setFolderDialogOpen(false);
    try {
      await createFolderAt(cwd, folderName);
    } catch (error) {
      // 此前只 console.log，失败时用户毫无感知
      onError(error as Error);
      return;
    }
    onUpload();
  };

  const handleUpload = useCallback(
    (action: string) => () => {
      const input = document.createElement("input");
      input.type = "file";
      switch (action) {
        case "photo":
          input.accept = "image/*";
          input.capture = "environment";
          break;
        case "image":
          input.accept = "image/*,video/*";
          break;
        case "file":
          input.accept = "*/*";
          break;
        case "folder":
          // @ts-ignore webkitdirectory 未进入标准 TS 类型
          input.webkitdirectory = true;
          break;
      }
      input.multiple = true;
      input.onchange = async () => {
        if (!input.files) return;
        const files = Array.from(input.files);
        if (action === "folder") {
          // 先逐级创建目录，再按相对路径入队
          const dirs = new Set<string>();
          for (const file of files) {
            const parts = file.webkitRelativePath.split("/");
            parts.pop(); // 去掉文件名
            for (let i = 1; i <= parts.length; i++)
              dirs.add(parts.slice(0, i).join("/"));
          }
          await ensureDirectories(
            [...dirs].sort((a, b) => a.split("/").length - b.split("/").length),
            cwd
          );
          uploadEnqueue(
            ...files.map((file) => ({
              file,
              basedir: relativeBasedir(file, cwd),
            }))
          );
        } else {
          uploadEnqueue(...files.map((file) => ({ file, basedir: cwd })));
        }
        setOpen(false);
        onUpload();
      };
      input.click();
    },
    [cwd, onUpload, setOpen, uploadEnqueue]
  );

  const takePhoto = useMemo(() => handleUpload("photo"), [handleUpload]);
  const uploadImage = useMemo(() => handleUpload("image"), [handleUpload]);
  const uploadFile = useMemo(() => handleUpload("file"), [handleUpload]);
  const uploadFolder = useMemo(() => handleUpload("folder"), [handleUpload]);

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={() => setOpen(false)}
      PaperProps={{ sx: { borderRadius: "16px 16px 0 0" } }}
    >
      <Card sx={{ padding: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={2.4}>
            <IconCaptionButton
              icon={<CameraIcon fontSize="large" />}
              caption={t("upload.camera")}
              onClick={takePhoto}
            />
          </Grid>
          <Grid item xs={2.4}>
            <IconCaptionButton
              icon={<ImageIcon fontSize="large" />}
              caption={t("upload.imageVideo")}
              onClick={uploadImage}
            />
          </Grid>
          <Grid item xs={2.4}>
            <IconCaptionButton
              icon={<UploadIcon fontSize="large" />}
              caption={t("upload.upload")}
              onClick={uploadFile}
            />
          </Grid>
          <Grid item xs={2.4}>
            <IconCaptionButton
              icon={<FolderIcon fontSize="large" />}
              caption={t("upload.uploadFolder")}
              onClick={uploadFolder}
            />
          </Grid>
          <Grid item xs={2.4}>
            <IconCaptionButton
              icon={<CreateNewFolderIcon fontSize="large" />}
              caption={t("upload.createFolder")}
              onClick={() => setFolderDialogOpen(true)}
            />
          </Grid>
        </Grid>
      </Card>
      <PromptDialog
        open={folderDialogOpen}
        title={t("upload.createFolder")}
        label={t("upload.folderName")}
        onSubmit={handleCreateFolder}
        onClose={() => setFolderDialogOpen(false)}
      />
    </Drawer>
  );
}

export default UploadDrawer;
