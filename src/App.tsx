import { ThemeProvider } from "@emotion/react";
import {
  createTheme,
  CssBaseline,
  GlobalStyles,
  Snackbar,
  Stack,
} from "@mui/material";
import React, { useEffect, useState } from "react";

import AuthDialog from "./AuthDialog";
import Header from "./Header";
import Main from "./Main";
import ProgressDialog from "./ProgressDialog";
import { saveCredentials, subscribeUnauthorized } from "./app/auth";
import { SortOption } from "./app/sort";
import { TransferQueueProvider } from "./app/transferQueue";

const globalStyles = (
  <GlobalStyles styles={{ "html, body, #root": { height: "100%" } }} />
);

const theme = createTheme({
  palette: { primary: { main: "#f38020" } },
});

function App() {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("name-asc");
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
            sort={sort}
            onSortChange={setSort}
          />
          <Main search={search} onError={setError} sort={sort} />
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
