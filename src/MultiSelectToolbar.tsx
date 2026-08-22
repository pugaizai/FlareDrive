import React, { useEffect, useState } from "react";
import { IconButton, Menu, MenuItem, Slide, Toolbar } from "@mui/material";
import {
  Close as CloseIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon,
  MoreHoriz as MoreHorizIcon,
} from "@mui/icons-material";
import { useI18n } from "./i18n";

function MultiSelectToolbar({
  multiSelected,
  onClose,
  onDownload,
  onRename,
  onDelete,
  onShare,
}: {
  multiSelected: string[] | null;
  onClose: () => void;
  onDownload: () => void;
  onRename: () => void;
  onDelete: () => void;
  onShare: () => void;
}) {
  const { t } = useI18n();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  // 选择状态变化时关闭二级菜单，避免重命名/删除后再次选中时菜单残留弹开
  useEffect(() => {
    setAnchorEl(null);
  }, [multiSelected]);

  return (
    <Slide direction="up" in={multiSelected !== null}>
      <Toolbar
        sx={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          backgroundColor: (theme) => theme.palette.background.paper,
          borderTop: "1px solid lightgray",
          justifyContent: "space-evenly",
        }}
      >
        <IconButton color="primary" onClick={onClose}>
          <CloseIcon />
        </IconButton>
        <IconButton
          color="primary"
          disabled={
            multiSelected?.length !== 1 || multiSelected[0].endsWith("/")
          }
          onClick={onDownload}
        >
          <DownloadIcon />
        </IconButton>
        <IconButton color="primary" onClick={onDelete}>
          <DeleteIcon />
        </IconButton>
        <IconButton
          aria-label={t("common.more")}
          color="primary"
          disabled={
            multiSelected?.length !== 1 || multiSelected[0].endsWith("/")
          }
          onClick={(e) => setAnchorEl(e.currentTarget)}
        >
          <MoreHorizIcon />
        </IconButton>
        {multiSelected?.length && (
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={() => setAnchorEl(null)}
          >
            {/* MUI Menu 不接受 Fragment 包裹的子元素（告警且键盘导航失效） */}
            {multiSelected.length === 1 && (
              <MenuItem
                onClick={() => {
                  setAnchorEl(null);
                  onRename();
                }}
              >
                {t("multiSelect.rename")}
              </MenuItem>
            )}
            {multiSelected.length === 1 && (
              <MenuItem
                onClick={() => {
                  setAnchorEl(null);
                  onShare();
                }}
              >
                {t("multiSelect.share")}
              </MenuItem>
            )}
          </Menu>
        )}
      </Toolbar>
    </Slide>
  );
}

export default MultiSelectToolbar;
