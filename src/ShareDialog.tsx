// 分享链接对话框：展示链接 + 复制/系统分享，替代 window.prompt（浏览器原生）
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";
import {
  Check as CheckIcon,
  ContentCopy as ContentCopyIcon,
  Share as ShareIcon,
} from "@mui/icons-material";
import { useEffect, useState } from "react";
import { useI18n } from "./i18n";

function ShareDialog({
  open,
  url,
  onClose,
}: {
  open: boolean;
  url: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) setCopied(false);
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // 剪贴板不可用时忽略（用户仍可手动选中复制）
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t("share.title")}</DialogTitle>
      <DialogContent>
        <TextField
          value={url}
          onChange={() => {}}
          fullWidth
          margin="normal"
          InputProps={{ readOnly: true }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={copy} startIcon={copied ? <CheckIcon /> : <ContentCopyIcon />}>
          {copied ? t("share.copied") : t("share.copy")}
        </Button>
        {typeof navigator.share === "function" && (
          <Button
            onClick={() => {
              navigator.share({ url }).catch(() => {});
            }}
            startIcon={<ShareIcon />}
          >
            {t("share.share")}
          </Button>
        )}
        <Button onClick={onClose}>{t("common.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}

export default ShareDialog;
