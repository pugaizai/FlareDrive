import { ThemeProvider } from "@emotion/react";
import {
  Button,
  createTheme,
  CssBaseline,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  GlobalStyles,
  Snackbar,
  Stack,
  TextField,
} from "@mui/material";
import React, { useEffect, useState } from "react";

import Header from "./Header";
import Main from "./Main";
import ProgressDialog from "./ProgressDialog";
import { saveCredentials, subscribeUnauthorized } from "./app/auth";
import { TransferQueueProvider } from "./app/transferQueue";

const globalStyles = (
  <GlobalStyles styles={{ "html, body, #root": { height: "100%" } }} />
);

const theme = createTheme({
  palette: { primary: { main: "#f38020" } },
});

function AuthDialog({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (username: string, password: string) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const submit = () => {
    if (!username) return;
    onSave(username, password);
    setUsername("");
    setPassword("");
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>WebDAV Authentication</DialogTitle>
      <DialogContent>
        <TextField
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          fullWidth
          margin="normal"
          autoFocus
        />
        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          fullWidth
          margin="normal"
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={!username}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function App() {
  const [search, setSearch] = useState("");
  const [showProgressDialog, setShowProgressDialog] = React.useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [showAuthDialog, setShowAuthDialog] = useState(false);

  // 任何 /webdav 请求返回 401 时弹出登录框
  useEffect(() => subscribeUnauthorized(() => setShowAuthDialog(true)), []);

  const handleAuthSave = (username: string, password: string) => {
    saveCredentials({ username, password });
    setShowAuthDialog(false);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {globalStyles}
      <TransferQueueProvider>
        <Stack sx={{ height: "100%" }}>
          <Header
            search={search}
            onSearchChange={(newSearch: string) => setSearch(newSearch)}
            setShowProgressDialog={setShowProgressDialog}
          />
          <Main search={search} onError={setError} />
        </Stack>
        <Snackbar
          autoHideDuration={5000}
          open={Boolean(error)}
          message={error?.message}
          onClose={() => setError(null)}
        />
        <ProgressDialog
          open={showProgressDialog}
          onClose={() => setShowProgressDialog(false)}
        />
      </TransferQueueProvider>
      <AuthDialog
        open={showAuthDialog}
        onClose={() => setShowAuthDialog(false)}
        onSave={handleAuthSave}
      />
    </ThemeProvider>
  );
}

export default App;
