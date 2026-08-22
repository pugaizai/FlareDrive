// 多语言字典（i18n）。
// en 是键的“源真值”：新增文案必须先加到这里，zh-CN / zh-TW 由类型
// Translation 约束必须补齐同名键，漏译会在编译期报错。

export type Locale = "en" | "zh-CN" | "zh-TW";

export const en = {
  // ---- 通用 ----
  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.save": "Save",
  "common.ok": "OK",
  "common.back": "Back",
  "common.more": "More",

  // ---- 顶栏 ----
  "header.searchPlaceholder": "Search…",
  "header.viewAs": "View as",
  "header.sortBy": "Sort by",
  "header.progress": "Progress",
  "header.language": "Language",

  // ---- 排序选项 ----
  "sort.nameAsc": "Name (A→Z)",
  "sort.nameDesc": "Name (Z→A)",
  "sort.sizeDesc": "Size (largest first)",
  "sort.sizeAsc": "Size (smallest first)",
  "sort.modifiedDesc": "Modified (newest first)",
  "sort.modifiedAsc": "Modified (oldest first)",

  // ---- 视图选项 ----
  "view.grid": "Grid",
  "view.list": "List",

  // ---- 主界面 ----
  "main.empty": "No files or folders",
  "main.openTextPad": "Open TextPad",
  "main.renameTitle": "Rename",
  "main.newNameLabel": "New name",
  "main.deleteTitle": "Delete",
  "main.deleteMessage": "Delete the following file(s) permanently?\n\n{list}",
  "main.downloadFailed": "Download failed",
  "main.renameExists": "\"{name}\" already exists",
  "main.shareNotEnabled":
    "Share links are not enabled. Set WEBDAV_SHARE_SECRET in your deployment to enable them.",
  "main.shareUnavailable": "Share links are unavailable ({status})",

  // ---- 登录对话框 ----
  "auth.title": "WebDAV Authentication",
  "auth.username": "Username",
  "auth.password": "Password",

  // ---- 确认对话框 ----
  "confirm.delete": "Delete",

  // ---- 多选工具栏 ----
  "multiSelect.rename": "Rename",
  "multiSelect.share": "Share",

  // ---- 传输进度对话框 ----
  "progress.title": "Progress",
  "progress.noTasks": "No tasks",

  // ---- 分享对话框 ----
  "share.title": "Share link",
  "share.copy": "Copy",
  "share.copied": "Copied",
  "share.share": "Share",

  // ---- TextPad 记事本 ----
  "textPad.title": "TextPad",
  "textPad.fileName": "File Name",
  "textPad.placeholder": "Write your note...",
  "textPad.saveAndUpload": "Save & Upload Note",
  "textPad.invalidName": "Invalid file name",

  // ---- 上传抽屉 ----
  "upload.camera": "Camera",
  "upload.imageVideo": "Image/Video",
  "upload.upload": "Upload",
  "upload.uploadFolder": "Upload Folder",
  "upload.createFolder": "Create Folder",
  "upload.folderName": "Folder name",

  // ---- 错误提示（来自应用逻辑，经 translateError 翻译后展示） ----
  "error.fetchFailed": "Failed to fetch",
  "error.invalidResponse": "Invalid response",
  "error.invalidTask": "Invalid task",
  "error.invalidFolderName": "Invalid folder name",
  "error.createFolderFailed": "Create folder failed with status {status}",
  "error.transferFailed": "{action} failed with status {status}",
  "error.actionMove": "Move",
  "error.actionCopy": "Copy",
  "error.deleteTimedOut": "Delete timed out after {attempts} retries: {path}",
  "error.deleteFailed": "Delete failed: {path} ({status})",
} as const;

export type TranslationKey = keyof typeof en;

/** 任意语言字典都必须覆盖全部键（漏译 → 编译错误） */
export type Translation = { [K in TranslationKey]: string };

export const zhCN: Translation = {
  "common.cancel": "取消",
  "common.close": "关闭",
  "common.save": "保存",
  "common.ok": "确定",
  "common.back": "返回",
  "common.more": "更多",

  "header.searchPlaceholder": "搜索…",
  "header.viewAs": "视图",
  "header.sortBy": "排序",
  "header.progress": "传输进度",
  "header.language": "语言",

  "sort.nameAsc": "名称（A→Z）",
  "sort.nameDesc": "名称（Z→A）",
  "sort.sizeDesc": "大小（从大到小）",
  "sort.sizeAsc": "大小（从小到大）",
  "sort.modifiedDesc": "修改时间（最新优先）",
  "sort.modifiedAsc": "修改时间（最早优先）",

  "view.grid": "网格视图",
  "view.list": "列表视图",

  "main.empty": "暂无文件或文件夹",
  "main.openTextPad": "打开记事本",
  "main.renameTitle": "重命名",
  "main.newNameLabel": "新名称",
  "main.deleteTitle": "删除",
  "main.deleteMessage": "确定要永久删除以下文件吗？\n\n{list}",
  "main.downloadFailed": "下载失败",
  "main.renameExists": "「{name}」已存在",
  "main.shareNotEnabled": "未启用分享链接。请在部署配置中设置 WEBDAV_SHARE_SECRET 以启用分享。",
  "main.shareUnavailable": "分享链接不可用（{status}）",

  "auth.title": "WebDAV 身份验证",
  "auth.username": "用户名",
  "auth.password": "密码",

  "confirm.delete": "删除",

  "multiSelect.rename": "重命名",
  "multiSelect.share": "分享",

  "progress.title": "传输进度",
  "progress.noTasks": "暂无任务",

  "share.title": "分享链接",
  "share.copy": "复制",
  "share.copied": "已复制",
  "share.share": "分享",

  "textPad.title": "记事本",
  "textPad.fileName": "文件名",
  "textPad.placeholder": "在此输入笔记内容…",
  "textPad.saveAndUpload": "保存并上传笔记",
  "textPad.invalidName": "文件名无效",

  "upload.camera": "拍照",
  "upload.imageVideo": "图片/视频",
  "upload.upload": "上传",
  "upload.uploadFolder": "上传文件夹",
  "upload.createFolder": "新建文件夹",
  "upload.folderName": "文件夹名称",

  "error.fetchFailed": "获取文件列表失败",
  "error.invalidResponse": "服务器响应无效",
  "error.invalidTask": "无效的任务",
  "error.invalidFolderName": "文件夹名称无效",
  "error.createFolderFailed": "创建文件夹失败（状态码 {status}）",
  "error.transferFailed": "{action} 失败（状态码 {status}）",
  "error.actionMove": "移动",
  "error.actionCopy": "复制",
  "error.deleteTimedOut": "删除超时（已重试 {attempts} 次）：{path}",
  "error.deleteFailed": "删除失败：{path}（状态码 {status}）",
};

export const zhTW: Translation = {
  "common.cancel": "取消",
  "common.close": "關閉",
  "common.save": "儲存",
  "common.ok": "確定",
  "common.back": "返回",
  "common.more": "更多",

  "header.searchPlaceholder": "搜尋…",
  "header.viewAs": "檢視",
  "header.sortBy": "排序",
  "header.progress": "傳輸進度",
  "header.language": "語言",

  "sort.nameAsc": "名稱（A→Z）",
  "sort.nameDesc": "名稱（Z→A）",
  "sort.sizeDesc": "大小（從大到小）",
  "sort.sizeAsc": "大小（從小到大）",
  "sort.modifiedDesc": "修改時間（最新優先）",
  "sort.modifiedAsc": "修改時間（最早優先）",

  "view.grid": "網格檢視",
  "view.list": "清單檢視",

  "main.empty": "暫無檔案或資料夾",
  "main.openTextPad": "開啟記事本",
  "main.renameTitle": "重新命名",
  "main.newNameLabel": "新名稱",
  "main.deleteTitle": "刪除",
  "main.deleteMessage": "確定要永久刪除以下檔案嗎？\n\n{list}",
  "main.downloadFailed": "下載失敗",
  "main.renameExists": "「{name}」已存在",
  "main.shareNotEnabled": "未啟用分享連結。請在部署設定中設定 WEBDAV_SHARE_SECRET 以啟用分享。",
  "main.shareUnavailable": "分享連結無法使用（{status}）",

  "auth.title": "WebDAV 身分驗證",
  "auth.username": "使用者名稱",
  "auth.password": "密碼",

  "confirm.delete": "刪除",

  "multiSelect.rename": "重新命名",
  "multiSelect.share": "分享",

  "progress.title": "傳輸進度",
  "progress.noTasks": "暫無任務",

  "share.title": "分享連結",
  "share.copy": "複製",
  "share.copied": "已複製",
  "share.share": "分享",

  "textPad.title": "記事本",
  "textPad.fileName": "檔案名稱",
  "textPad.placeholder": "在此輸入筆記內容…",
  "textPad.saveAndUpload": "儲存並上傳筆記",
  "textPad.invalidName": "檔案名稱無效",

  "upload.camera": "拍照",
  "upload.imageVideo": "圖片/影片",
  "upload.upload": "上傳",
  "upload.uploadFolder": "上傳資料夾",
  "upload.createFolder": "建立資料夾",
  "upload.folderName": "資料夾名稱",

  "error.fetchFailed": "取得檔案清單失敗",
  "error.invalidResponse": "伺服器回應無效",
  "error.invalidTask": "無效的工作",
  "error.invalidFolderName": "資料夾名稱無效",
  "error.createFolderFailed": "建立資料夾失敗（狀態碼 {status}）",
  "error.transferFailed": "{action} 失敗（狀態碼 {status}）",
  "error.actionMove": "移動",
  "error.actionCopy": "複製",
  "error.deleteTimedOut": "刪除逾時（已重試 {attempts} 次）：{path}",
  "error.deleteFailed": "刪除失敗：{path}（狀態碼 {status}）",
};

export const DICTIONARIES: Record<Locale, Translation> = {
  en,
  "zh-CN": zhCN,
  "zh-TW": zhTW,
};

/** 简单插值：把 {key} 占位符替换为 params 中的值，缺失或 undefined 时保留占位符 */
export function interpolate(
  template: string,
  params?: Record<string, string | number | undefined>
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key];
    return value == null ? match : String(value);
  });
}
