import {
  IconButton,
  InputBase,
  Menu,
  MenuItem,
  Toolbar,
} from "@mui/material";
import { useState } from "react";
import {
  ArrowBack as ArrowBackIcon,
  Check as CheckIcon,
  MoreHoriz as MoreHorizIcon,
} from "@mui/icons-material";
import { SORT_OPTIONS, SortOption } from "./app/sort";

function Header({
  search,
  onSearchChange,
  setShowProgressDialog,
  sort,
  onSortChange,
}: {
  search: string;
  onSearchChange: (newSearch: string) => void;
  setShowProgressDialog: (show: boolean) => void;
  sort: SortOption;
  onSortChange: (sort: SortOption) => void;
}) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [view, setView] = useState<"main" | "sort">("main");

  const close = () => {
    setAnchorEl(null);
    setView("main");
  };

  return (
    <Toolbar disableGutters sx={{ padding: 1 }}>
      <InputBase
        size="small"
        fullWidth
        placeholder="Search…"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        sx={{
          backgroundColor: "whitesmoke",
          borderRadius: "999px",
          padding: "8px 16px",
        }}
      />
      <IconButton
        aria-label="More"
        color="inherit"
        sx={{ marginLeft: 0.5 }}
        onClick={(e) => {
          setAnchorEl(e.currentTarget);
          setView("main");
        }}
      >
        <MoreHorizIcon />
      </IconButton>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={close}>
        {view === "main" ? (
          <div>
            <MenuItem onClick={() => setView("sort")}>Sort by</MenuItem>
            <MenuItem disabled>View as</MenuItem>
            <MenuItem
              onClick={() => {
                close();
                setShowProgressDialog(true);
              }}
            >
              Progress
            </MenuItem>
          </div>
        ) : (
          <div>
            <MenuItem onClick={() => setView("main")}>
              <ArrowBackIcon fontSize="small" sx={{ mr: 1 }} />
              Back
            </MenuItem>
            {SORT_OPTIONS.map((option) => (
              <MenuItem
                key={option.value}
                selected={sort === option.value}
                onClick={() => {
                  onSortChange(option.value);
                  close();
                }}
              >
                {option.label}
                {sort === option.value && (
                  <CheckIcon fontSize="small" sx={{ ml: 1 }} />
                )}
              </MenuItem>
            ))}
          </div>
        )}
      </Menu>
    </Toolbar>
  );
}

export default Header;
