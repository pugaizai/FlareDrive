import {
  IconButton,
  InputBase,
  Menu,
  MenuItem,
  Toolbar,
} from "@mui/material";
import React, { useState } from "react";
import {
  ArrowBack as ArrowBackIcon,
  Check as CheckIcon,
  MoreHoriz as MoreHorizIcon,
} from "@mui/icons-material";
import { SORT_OPTIONS, SortOption } from "./app/sort";
import { VIEW_OPTIONS, ViewOption } from "./app/view";

function Header({
  search,
  onSearchChange,
  setShowProgressDialog,
  sort,
  onSortChange,
  view,
  onViewChange,
}: {
  search: string;
  onSearchChange: (newSearch: string) => void;
  setShowProgressDialog: (show: boolean) => void;
  sort: SortOption;
  onSortChange: (sort: SortOption) => void;
  view: ViewOption;
  onViewChange: (view: ViewOption) => void;
}) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [submenu, setSubmenu] = useState<"sort" | "view" | null>(null);

  const close = () => {
    setAnchorEl(null);
    setSubmenu(null);
  };

  const submenuOptions = submenu === "sort" ? SORT_OPTIONS : VIEW_OPTIONS;
  const currentValue: string = submenu === "sort" ? sort : view;
  const onSelect =
    submenu === "sort"
      ? (value: string) => onSortChange(value as SortOption)
      : (value: string) => onViewChange(value as ViewOption);

  // MUI Menu 不接受 Fragment/div 包裹的子元素（键盘导航失效且告警），
  // 用数组直接渲染 MenuItem
  const menuItems: React.ReactNode[] =
    submenu === null
      ? [
          <MenuItem key="view" onClick={() => setSubmenu("view")}>
            View as
          </MenuItem>,
          <MenuItem key="sort" onClick={() => setSubmenu("sort")}>
            Sort by
          </MenuItem>,
          <MenuItem
            key="progress"
            onClick={() => {
              close();
              setShowProgressDialog(true);
            }}
          >
            Progress
          </MenuItem>,
        ]
      : [
          <MenuItem key="back" onClick={() => setSubmenu(null)}>
            <ArrowBackIcon fontSize="small" sx={{ mr: 1 }} />
            Back
          </MenuItem>,
          ...submenuOptions.map((option) => (
            <MenuItem
              key={option.value}
              selected={currentValue === option.value}
              onClick={() => {
                onSelect(option.value);
                close();
              }}
            >
              {option.label}
              {currentValue === option.value && (
                <CheckIcon fontSize="small" sx={{ ml: 1 }} />
              )}
            </MenuItem>
          )),
        ];

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
          setSubmenu(null);
        }}
      >
        <MoreHorizIcon />
      </IconButton>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={close}>
        {menuItems}
      </Menu>
    </Toolbar>
  );
}

export default Header;
