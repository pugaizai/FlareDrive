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
      setNameError("Invalid file name");
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
          <Typography variant="h6">TextPad</Typography>
          <IconButton onClick={() => setOpen(false)}>
            <CloseIcon />
          </IconButton>
        </Box>

        <TextField
          label="File Name"
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
          label="Write your note..."
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
          Save & Upload Note
        </Button>
      </Box>
    </Drawer>
  );
};

export default TextPadDrawer;
