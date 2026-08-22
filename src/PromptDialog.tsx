// 通用输入对话框：替代 window.prompt（浏览器原生），用于重命名/新建文件夹等
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useI18n } from "./i18n";

function PromptDialog({
  open,
  title,
  label,
  initialValue,
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  label?: string;
  initialValue?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(initialValue ?? "");

  useEffect(() => {
    if (open) setValue(initialValue ?? "");
  }, [open, initialValue]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <TextField
          label={label ?? title}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          fullWidth
          margin="normal"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="contained" onClick={submit} disabled={!value.trim()}>
          {t("common.ok")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default PromptDialog;
