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
import { ViewOption } from "./app/view";
import { translateError, useI18n } from "./i18n";

const globalStyles = (
  <GlobalStyles styles={{ "html, body, #root": { height: "100%" } }} />
);

const theme = createTheme({
  palette: { primary: { main: "#f38020" } },
});

function App() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("name-asc");
  const [view, setView] = useState<ViewOption>("grid");
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
            view={view}
            onViewChange={setView}
          />
          <Main search={search} onError={setError} sort={sort} view={view} />
        </Stack>
        <Snackbar
          autoHideDuration={5000}
          open={Boolean(error)}
          message={error ? translateError(error, t) : undefined}
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
