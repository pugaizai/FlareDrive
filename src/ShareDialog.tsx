// 分享链接对话框：先选有效期档位生成链接（1 小时 ~ 30 天，不允许永久），
// 再展示链接 + 复制/系统分享
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
} from "@mui/material";
import {
  Check as CheckIcon,
  ContentCopy as ContentCopyIcon,
  Share as ShareIcon,
} from "@mui/icons-material";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "./i18n";

// 预设有效期档位（秒），上下界与后端 SHARE_TTL_MIN/MAX 保持一致
const TTL_OPTIONS = [
  { seconds: 3600, label: "share.ttl.1h" },
  { seconds: 21600, label: "share.ttl.6h" },
  { seconds: 43200, label: "share.ttl.12h" },
  { seconds: 86400, label: "share.ttl.1d" },
  { seconds: 259200, label: "share.ttl.3d" },
  { seconds: 604800, label: "share.ttl.7d" },
  { seconds: 1209600, label: "share.ttl.14d" },
  { seconds: 2592000, label: "share.ttl.30d" },
] as const;

// 与旧版全局默认一致：1 天
const DEFAULT_TTL_SECONDS = 86400;

function ShareDialog({
  open,
  onClose,
  onCreate,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (ttlSeconds: number) => Promise<string>;
  onError: (error: Error) => void;
}) {
  const { t } = useI18n();
  const [ttl, setTtl] = useState<number>(DEFAULT_TTL_SECONDS);
  const [url, setUrl] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  // 关闭后重开即视为新一轮生成；在途请求返回时按序号丢弃，避免串话
  const requestSeq = useRef(0);

  useEffect(() => {
    if (open) {
      setTtl(DEFAULT_TTL_SECONDS);
      setUrl(null);
      setCreating(false);
      setCopied(false);
      requestSeq.current += 1;
    }
  }, [open]);

  const create = async () => {
    setCreating(true);
    const seq = requestSeq.current;
    try {
      const generated = await onCreate(ttl);
      if (seq === requestSeq.current) setUrl(generated);
    } catch (error) {
      if (seq === requestSeq.current) onError(error as Error);
    } finally {
      if (seq === requestSeq.current) setCreating(false);
    }
  };

  const copy = async () => {
    if (url === null) return;
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
        {url === null ? (
          <TextField
            select
            label={t("share.ttl")}
            value={ttl}
            onChange={(event) => setTtl(Number(event.target.value))}
            fullWidth
            margin="normal"
            disabled={creating}
          >
            {TTL_OPTIONS.map((option) => (
              <MenuItem key={option.seconds} value={option.seconds}>
                {t(option.label)}
              </MenuItem>
            ))}
          </TextField>
        ) : (
          <TextField
            value={url}
            onChange={() => {}}
            fullWidth
            margin="normal"
            InputProps={{ readOnly: true }}
          />
        )}
      </DialogContent>
      <DialogActions>
        {url === null ? (
          <Button onClick={create} disabled={creating}>
            {t("share.generate")}
          </Button>
        ) : (
          <>
            <Button
              onClick={copy}
              startIcon={copied ? <CheckIcon /> : <ContentCopyIcon />}
            >
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
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

export default ShareDialog;
