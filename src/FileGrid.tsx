import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  Grid,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import ImageIcon from "@mui/icons-material/Image";
import MimeIcon from "./MimeIcon";
import { webdavFetch } from "./app/auth";
import { humanReadableSize } from "./app/utils";
import { ViewOption } from "./app/view";

export interface FileItem {
  key: string;
  size: number;
  uploaded: string;
  httpMetadata: { contentType: string };
  customMetadata?: { thumbnail?: string };
}

interface BoxRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function extractFilename(key: string) {
  return key.split("/").pop();
}

export function encodeKey(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

export function isDirectory(file: FileItem) {
  return file.httpMetadata?.contentType === "application/x-directory";
}

// ---- 框选边缘自动滚动 ----

// 指针靠近滚动容器上下边缘这段距离时开始自动滚动
const EDGE_SCROLL_ZONE = 48;

// 找到最近的滚动容器（DropZone 等 overflowY: auto/scroll 的祖先）
function findScrollableAncestor(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const style = getComputedStyle(node);
    if (
      /(auto|scroll)/.test(style.overflowY) &&
      node.scrollHeight > node.clientHeight
    )
      return node;
    node = node.parentElement;
  }
  return null;
}

// 指针越靠近边缘滚动越快；在边缘之外返回 0（停止滚动）
function edgeScrollDelta(scroller: HTMLElement, clientY: number): number {
  const rect = scroller.getBoundingClientRect();
  if (clientY < rect.top + EDGE_SCROLL_ZONE)
    return -Math.max(
      6,
      Math.ceil((rect.top + EDGE_SCROLL_ZONE - clientY) / 2)
    );
  if (clientY > rect.bottom - EDGE_SCROLL_ZONE)
    return Math.max(
      6,
      Math.ceil((clientY - (rect.bottom - EDGE_SCROLL_ZONE)) / 2)
    );
  return 0;
}

// <img> 标签无法携带 Authorization 头，缩略图通过带认证的 fetch 加载为 Blob
function Thumbnail({ digest, alt }: { digest: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    webdavFetch(
      `/webdav/_$flaredrive$/thumbnails/${encodeURIComponent(digest)}.png`
    )
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (!blob || cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [digest]);

  if (!src) return <ImageIcon fontSize="large" />;
  return (
    <img
      src={src}
      alt={alt}
      // 关键：img 默认可被浏览器原生拖拽，会吞掉 mousemove 导致框选失效；
      // 容器层还有 onDragStart 兜底拦截
      draggable={false}
      style={{ width: 36, height: 36, objectFit: "cover" }}
    />
  );
}

// 网格/列表共用的单行内容
function FileRow({
  file,
  multiSelected,
  boxKeys,
  onMultiSelect,
  onCwdChange,
  suppressClickRef,
}: {
  file: FileItem;
  multiSelected: string[] | null;
  boxKeys: string[];
  onMultiSelect: (key: string) => void;
  onCwdChange: (newCwd: string) => void;
  suppressClickRef: React.MutableRefObject<boolean>;
}) {
  // 预览走应用自己的认证（带 Authorization 头的 fetch → Blob → 新标签页），
  // 不再 window.open 直连 /webdav（那会触发浏览器原生 Basic Auth 弹窗）。
  const openFile = async () => {
    try {
      const res = await webdavFetch(`/webdav/${encodeKey(file.key)}`);
      if (!res.ok) return; // 401 时 webdavFetch 已通知登录弹窗
      const blob = await res.blob();
      // 新标签页在后台流式读取 blob，过早 revoke 会中断；交由页面生命周期回收
      window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
    } catch {
      // 忽略：网络错误等不打断用户操作
    }
  };

  return (
    <ListItemButton
      data-key={file.key}
      selected={
        multiSelected?.includes(file.key) || boxKeys.includes(file.key)
      }
      onClick={() => {
        // 框选拖拽结束后的残余 click 需要被吞掉，避免误打开文件
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }
        if (multiSelected !== null) {
          onMultiSelect(file.key);
        } else if (isDirectory(file)) {
          onCwdChange(file.key + "/");
        } else openFile();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        // 资源管理器惯例：右键已选中的行保持整个选择不变
        // （此前按 toggle 处理，会把该行悄悄移出批量操作范围）
        if (!multiSelected?.includes(file.key)) onMultiSelect(file.key);
      }}
      sx={{ userSelect: "none" }}
    >
      <ListItemIcon>
        {file.customMetadata?.thumbnail ? (
          <Thumbnail digest={file.customMetadata.thumbnail} alt={file.key} />
        ) : (
          <MimeIcon contentType={file.httpMetadata.contentType} />
        )}
      </ListItemIcon>
      <ListItemText
        primary={extractFilename(file.key)}
        primaryTypographyProps={{
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
        secondary={
          <React.Fragment>
            {/* secondary 渲染为 <p>，内部不能放块级 <div>，用 span 保持行内布局 */}
            <Box
              component="span"
              sx={{
                display: "inline-block",
                minWidth: "160px",
                marginRight: 1,
              }}
            >
              {new Date(file.uploaded).toLocaleString()}
            </Box>
            {!isDirectory(file) && humanReadableSize(file.size)}
          </React.Fragment>
        }
      />
    </ListItemButton>
  );
}

// 行组件 memo：父级因搜索/排序等重渲染时，未变化的行不重渲染。
// 比较只依赖 file 引用、多选状态与框选高亮（回调来自 Main，均稳定）。
const MemoFileRow = React.memo(
  FileRow,
  (prev, next) =>
    prev.file === next.file &&
    prev.multiSelected === next.multiSelected &&
    prev.boxKeys === next.boxKeys
);

function FileGrid({
  files,
  onCwdChange,
  multiSelected,
  onMultiSelect,
  emptyMessage,
  view,
  onSelectMany,
}: {
  files: FileItem[];
  onCwdChange: (newCwd: string) => void;
  multiSelected: string[] | null;
  onMultiSelect: (key: string) => void;
  emptyMessage?: React.ReactNode;
  view: ViewOption;
  onSelectMany: (keys: string[]) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const suppressClickRef = useRef(false);
  const dragStart = useRef<{
    x: number;
    y: number;
    started: boolean;
    onRow: boolean;
    pointerId: number;
    scroller: HTMLElement | null;
    rafId: number | null;
    lastClientY: number;
    /** pointerdown 时滚动容器的 scrollTop，用于把锚点修正回内容坐标 */
    startScrollTop: number;
  } | null>(null);
  const boxRef = useRef<BoxRect | null>(null);
  const [box, setBox] = useState<BoxRect | null>(null);
  const [boxKeys, setBoxKeys] = useState<string[]>([]);

  if (files.length === 0) return <>{emptyMessage}</>;

  const computeBoxKeys = (b: BoxRect): string[] => {
    const container = containerRef.current;
    if (!container) return [];
    const crect = container.getBoundingClientRect();
    const keys: string[] = [];
    container.querySelectorAll<HTMLElement>("[data-key]").forEach((el) => {
      const r = el.getBoundingClientRect();
      const left = r.left - crect.left;
      const right = r.right - crect.left;
      const top = r.top - crect.top;
      const bottom = r.bottom - crect.top;
      if (left < b.x2 && right > b.x1 && top < b.y2 && bottom > b.y1) {
        keys.push(el.dataset.key as string);
      }
    });
    return keys;
  };

  const stopDrag = () => {
    const start = dragStart.current;
    dragStart.current = null;
    boxRef.current = null;
    if (start?.rafId != null) cancelAnimationFrame(start.rafId);
    setBox(null);
    setBoxKeys([]);
  };

  // Pointer Events + setPointerCapture：事件跟随指针（拖出窗口/容器仍送达），
  // 无需 document 级监听，天然避免监听器泄漏；mouse/pen 可用，touch 保留原生滚动
  const handlePointerDown = (e: React.PointerEvent) => {
    // 触屏：框选与列表滚动共用同一手势，直接接管会破坏滚动，保持原生行为
    if (e.pointerType === "touch") return;
    if (e.button !== 0) return;
    const container = containerRef.current;
    if (!container) return;
    const crect = container.getBoundingClientRect();
    const onRow = (e.target as HTMLElement).closest("[data-key]") !== null;
    dragStart.current = {
      x: e.clientX - crect.left,
      y: e.clientY - crect.top,
      started: false,
      onRow,
      pointerId: e.pointerId,
      scroller: findScrollableAncestor(container),
      rafId: null,
      lastClientY: e.clientY,
      startScrollTop: 0,
    };
    dragStart.current.startScrollTop = dragStart.current.scroller?.scrollTop ?? 0;
    // 不能在此处 setPointerCapture：捕获会改变后续 click 事件的目标（落到容器
    // 而非被点击的行），导致普通点击打不开文件夹/文件。捕获延迟到真正进入
    // 拖拽（超过 4px 阈值）之后，见 handlePointerMove。
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const start = dragStart.current;
    const container = containerRef.current;
    if (!start || !container || e.pointerId !== start.pointerId) return;
    start.lastClientY = e.clientY;

    // 滚动容器可能在拖动中被滚动（含下面的边缘自动滚动），
    // 坐标必须实时换算，不能缓存 pointerdown 时的容器矩形
    const crect = container.getBoundingClientRect();
    const cx = e.clientX - crect.left;
    const cy = e.clientY - crect.top;
    if (!start.started && Math.hypot(cx - start.x, cy - start.y) > 4) {
      start.started = true;
      // 进入拖拽后才捕获指针：拖出窗口/容器仍能收到 move/up（不泄漏监听）；
      // 普通点击不捕获，click 仍落在原目标行上，文件夹导航/文件打开不受影响
      try {
        container.setPointerCapture(start.pointerId);
      } catch {
        // 捕获失败（如测试环境）不影响基本框选
      }
    }
    if (!start.started) return;
    // 锚点跟随内容滚动：边缘自动滚动时内容在静止的光标下移动，
    // 不修正的话选框会与起始行脱节，滚过锚定边的行会被漏选
    const scrolled =
      (start.scroller?.scrollTop ?? 0) - start.startScrollTop;
    const anchorY = start.y - scrolled;
    const b: BoxRect = {
      x1: Math.min(start.x, cx),
      y1: Math.min(anchorY, cy),
      x2: Math.max(start.x, cx),
      y2: Math.max(anchorY, cy),
    };
    boxRef.current = b;
    setBox(b);
    setBoxKeys(computeBoxKeys(b));

    // 边缘自动滚动：进入边缘区后启动 rAF 循环，离开后自动停止
    if (!start.scroller) return;
    if (start.rafId === null && edgeScrollDelta(start.scroller, e.clientY) !== 0) {
      const step = () => {
        const s = dragStart.current;
        if (!s || !s.scroller) return;
        const delta = edgeScrollDelta(s.scroller, s.lastClientY);
        if (delta === 0) {
          s.rafId = null;
          return;
        }
        s.scroller.scrollTop += delta;
        // 内容随滚动移动：用最新矩形重新命中，选框下的行高亮实时更新
        if (boxRef.current && containerRef.current)
          setBoxKeys(computeBoxKeys(boxRef.current));
        s.rafId = requestAnimationFrame(step);
      };
      start.rafId = requestAnimationFrame(step);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const start = dragStart.current;
    if (!start || e.pointerId !== start.pointerId) return;
    const lastBox = boxRef.current;
    stopDrag();
    if (start.started) {
      // 吞掉拖拽结束后的残余 click
      suppressClickRef.current = true;
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      if (lastBox) onSelectMany(computeBoxKeys(lastBox));
    } else if (!start.onRow) {
      // 空白处点击：清空选择（资源管理器风格）
      onSelectMany([]);
    }
  };

  // 浏览器接管手势（如触屏滚动取消）时清理状态，不做选择
  const handlePointerCancel = (e: React.PointerEvent) => {
    const start = dragStart.current;
    if (!start || e.pointerId !== start.pointerId) return;
    stopDrag();
  };

  const rowProps = (file: FileItem) => ({
    file,
    multiSelected,
    boxKeys,
    onMultiSelect,
    onCwdChange,
    suppressClickRef,
  });

  return (
    <Box
      ref={containerRef}
      data-testid="file-grid"
      // minHeight 撑满滚动容器视口，使行下方的空白区域也能开始框选
      sx={{
        position: "relative",
        minHeight: "100%",
        userSelect: box ? "none" : undefined,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      // 兜底：阻止网格内任何原生拖拽启动（如缩略图），保证框选 pointermove 正常
      onDragStart={(e) => e.preventDefault()}
    >
      {view === "list" ? (
        <List sx={{ paddingBottom: "48px" }}>
          {files.map((file) => (
            <MemoFileRow key={file.key} {...rowProps(file)} />
          ))}
        </List>
      ) : (
        <Grid container sx={{ paddingBottom: "48px" }}>
          {files.map((file) => (
            <Grid item key={file.key} xs={12} sm={6} md={4} lg={3} xl={2}>
              <MemoFileRow {...rowProps(file)} />
            </Grid>
          ))}
        </Grid>
      )}
      {box && (
        <Box
          sx={{
            position: "absolute",
            left: box.x1,
            top: box.y1,
            width: box.x2 - box.x1,
            height: box.y2 - box.y1,
            border: "1px solid",
            borderColor: "primary.main",
            backgroundColor: "primary.main",
            opacity: 0.15,
            pointerEvents: "none",
            zIndex: 5,
          }}
        />
      )}
    </Box>
  );
}

export default FileGrid;
