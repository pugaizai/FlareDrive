// 通用确认对话框：替代 window.confirm（浏览器原生弹窗），用于删除等破坏性操作
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";
import { useI18n } from "./i18n";

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const label = confirmLabel ?? t("confirm.delete");

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText
          // 文件名列表用换行分隔，pre-wrap 保持换行、break-all 防止长名撑破对话框
          sx={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}
        >
          {message}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="contained" color="error" onClick={onConfirm}>
          {label}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default ConfirmDialog;
