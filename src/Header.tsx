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
import { LOCALES, useI18n } from "./i18n";

type Submenu = "sort" | "view" | "language" | null;

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
  const { t, locale, setLocale } = useI18n();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [submenu, setSubmenu] = useState<Submenu>(null);

  const close = () => {
    setAnchorEl(null);
    setSubmenu(null);
  };

  const submenuOptions =
    submenu === "sort" ? SORT_OPTIONS : VIEW_OPTIONS;
  const currentValue: string =
    submenu === "sort" ? sort : submenu === "view" ? view : "";
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
            {t("header.viewAs")}
          </MenuItem>,
          <MenuItem key="sort" onClick={() => setSubmenu("sort")}>
            {t("header.sortBy")}
          </MenuItem>,
          <MenuItem key="language" onClick={() => setSubmenu("language")}>
            {t("header.language")}
          </MenuItem>,
          <MenuItem
            key="progress"
            onClick={() => {
              close();
              setShowProgressDialog(true);
            }}
          >
            {t("header.progress")}
          </MenuItem>,
        ]
      : [
          <MenuItem key="back" onClick={() => setSubmenu(null)}>
            <ArrowBackIcon fontSize="small" sx={{ mr: 1 }} />
            {t("common.back")}
          </MenuItem>,
          ...(submenu === "language"
            ? LOCALES.map((option) => (
                <MenuItem
                  key={option.value}
                  selected={locale === option.value}
                  onClick={() => {
                    setLocale(option.value);
                    close();
                  }}
                >
                  {option.label}
                  {locale === option.value && (
                    <CheckIcon fontSize="small" sx={{ ml: 1 }} />
                  )}
                </MenuItem>
              ))
            : submenuOptions.map((option) => (
                <MenuItem
                  key={option.value}
                  selected={currentValue === option.value}
                  onClick={() => {
                    onSelect(option.value);
                    close();
                  }}
                >
                  {t(option.labelKey)}
                  {currentValue === option.value && (
                    <CheckIcon fontSize="small" sx={{ ml: 1 }} />
                  )}
                </MenuItem>
              ))),
        ];

  return (
    <Toolbar disableGutters sx={{ padding: 1 }}>
      <InputBase
        size="small"
        fullWidth
        placeholder={t("header.searchPlaceholder")}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        sx={{
          backgroundColor: "whitesmoke",
          borderRadius: "999px",
          padding: "8px 16px",
        }}
      />
      <IconButton
        aria-label={t("common.more")}
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
