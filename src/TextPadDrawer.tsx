// TextPadDrawer.tsx
import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  Drawer,
  TextField,
  Typography,
  IconButton,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useUploadEnqueue } from "./app/transferQueue";
import { useI18n } from "./i18n";

interface TextPadDrawerProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  cwd: string;
  onUpload: () => void;
}

const TextPadDrawer: React.FC<TextPadDrawerProps> = ({
  open,
  setOpen,
  cwd,
  onUpload,
}) => {
  const { t } = useI18n();
  const [noteText, setNoteText] = useState("");
  const [noteName, setNoteName] = useState("note.txt");
  // 文件名非法时的应用内错误提示（替代浏览器原生 window.alert）
  const [nameError, setNameError] = useState<string | null>(null);
  const uploadEnqueue = useUploadEnqueue();

  // 重新打开时清掉上次的错误
  useEffect(() => {
    if (open) setNameError(null);
  }, [open]);

  const handleSaveNote = () => {
    const trimmedName = noteName.trim();
    // 与 createFolder 一致：不允许空文件名或包含路径分隔符
    if (!trimmedName || trimmedName.includes("/")) {
      setNameError(t("textPad.invalidName"));
      return;
    }
    const fileBlob = new Blob([noteText], { type: "text/plain" });
    const file = new File([fileBlob], trimmedName, { type: "text/plain" });
    uploadEnqueue({ file, basedir: cwd });
    onUpload(); // Refresh file list after upload
    setOpen(false); // Close drawer
    setNoteText(""); // Reset
    setNoteName("note.txt");
    setNameError(null);
  };

  return (
    <Drawer anchor="right" open={open} onClose={() => setOpen(false)}>
      <Box sx={{ width: 400, padding: 2, display: "flex", flexDirection: "column", height: "100%" }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
          <Typography variant="h6">{t("textPad.title")}</Typography>
          <IconButton onClick={() => setOpen(false)}>
            <CloseIcon />
          </IconButton>
        </Box>

        <TextField
          label={t("textPad.fileName")}
          value={noteName}
          onChange={(e) => {
            setNoteName(e.target.value);
            if (nameError) setNameError(null);
          }}
          fullWidth
          error={Boolean(nameError)}
          helperText={nameError ?? undefined}
          sx={{ mb: 2 }}
        />

        <TextField
          label={t("textPad.placeholder")}
          multiline
          rows={15}
          variant="outlined"
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          fullWidth
        />

        <Button
          variant="contained"
          sx={{ mt: 2 }}
          onClick={handleSaveNote}
          disabled={!noteText.trim()}
        >
          {t("textPad.saveAndUpload")}
        </Button>
      </Box>
    </Drawer>
  );
};

export default TextPadDrawer;
