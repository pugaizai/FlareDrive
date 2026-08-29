import pLimit from "p-limit";

import { encodeKey, FileItem } from "../FileGrid";
import { appError } from "./errors";
import { webdavFetch, createAuthHeaders, notifyUnauthorized } from "./auth";
import { TransferTask } from "./transferQueue";

const WEBDAV_ENDPOINT = "/webdav/";

export async function fetchPath(path: string) {
  const res = await webdavFetch(`${WEBDAV_ENDPOINT}${encodeKey(path)}`, {
    method: "PROPFIND",
    headers: { Depth: "1" },
  });

  if (!res.ok) throw appError("fetchFailed", "Failed to fetch");
  if (!res.headers.get("Content-Type")?.includes("application/xml"))
    throw appError("invalidResponse", "Invalid response");

  const parser = new DOMParser();
  const text = await res.text();
  const document = parser.parseFromString(text, "application/xml");
  const items: FileItem[] = Array.from(document.querySelectorAll("response"))
    .filter(
      (response) =>
        decodeURIComponent(
          response.querySelector("href")?.textContent ?? ""
        ).slice(WEBDAV_ENDPOINT.length) !== path.replace(/\/$/, "")
    )
    .map((response) => {
      const href = response.querySelector("href")?.textContent;
      if (!href) throw appError("invalidResponse", "Invalid response");
      const contentType = response.querySelector("getcontenttype")?.textContent;
      const size = response.querySelector("getcontentlength")?.textContent;
      const lastModified =
        response.querySelector("getlastmodified")?.textContent;
      const thumbnail = response.getElementsByTagNameNS(
        "flaredrive",
        "thumbnail"
      )[0]?.textContent;
      return {
        key: decodeURIComponent(href).replace(/^\/webdav\//, ""),
        size: size ? Number(size) : 0,
        uploaded: lastModified!,
        httpMetadata: { contentType: contentType! },
        customMetadata: { thumbnail },
      } as FileItem;
    });
  return items;
}

const THUMBNAIL_SIZE = 144;
// 缩略图生成的兜底超时：媒体解码失败时只触发 error 事件（或什么都不触发），
// 不加超时会让 Promise 永不落定，进而卡死整个上传队列
const THUMBNAIL_TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), THUMBNAIL_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function generateThumbnail(file: File) {
  const canvas = document.createElement("canvas");
  canvas.width = THUMBNAIL_SIZE;
  canvas.height = THUMBNAIL_SIZE;
  var ctx = canvas.getContext("2d")!;

  if (file.type.startsWith("image/")) {
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await withTimeout(
        new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          // 损坏/浏览器不支持的图片（如 HEIC）只触发 onerror：此前未监听，
          // Promise 永不落定导致上传队列死锁
          image.onerror = () => reject(new Error("Image decode failed"));
          image.onload = () => resolve(image);
          image.src = objectUrl;
        }),
        "Image load timeout"
      );
      ctx.drawImage(image, 0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } else if (file.type === "video/mp4") {
    // Generate thumbnail from video
    const objectUrl = URL.createObjectURL(file);
    try {
      const video = await withTimeout(
        new Promise<HTMLVideoElement>((resolve, reject) => {
          const video = document.createElement("video");
          video.muted = true;
          video.preload = "auto";
          video.onerror = () => reject(new Error("Video decode failed"));
          video.onloadeddata = async () => {
            try {
              // 部分浏览器不 play 不解码首帧；自动播放被策略拒绝时忽略
              await video.play();
              video.pause();
            } catch {
              // 依赖 loadeddata 时已可用的首帧
            }
            video.onseeked = () => resolve(video);
            // currentTime 已经是 0 时赋值不会触发 seeked 事件
            if (video.currentTime === 0) resolve(video);
            else video.currentTime = 0;
          };
          video.src = objectUrl;
        }),
        "Video load timeout"
      );
      ctx.drawImage(video, 0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } else if (file.type === "application/pdf") {
    const objectUrl = URL.createObjectURL(file);
    try {
      const pdfjsLib = await import(
        // @ts-ignore
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs"
      );
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";
      const pdf = await pdfjsLib.getDocument(objectUrl).promise;
      const page = await pdf.getPage(1);
      const { width, height } = page.getViewport({ scale: 1 });
      var scale = THUMBNAIL_SIZE / Math.max(width, height);
      const viewport = page.getViewport({ scale });
      const renderContext = { canvasContext: ctx, viewport };
      await page.render(renderContext).promise;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  const thumbnailBlob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) =>
      blob ? resolve(blob) : reject(new Error("Canvas export failed"))
    )
  );

  return thumbnailBlob;
}

export async function blobDigest(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-1", await blob.arrayBuffer());
  const digestArray = Array.from(new Uint8Array(digest));
  const digestHex = digestArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return digestHex;
}

export const SIZE_LIMIT = 100 * 1000 * 1000; // 100MB

// 服务端分批操作（目录删除/复制）返回 503 + Retry-After 时的客户端重试参数
const MAX_COPY_RETRIES = 30; // 每次调用约复制 15 个子对象 → 最多约 450 个
const MAX_DELETE_RETRIES = 50; // 每次调用删除 40 个 → 最多约 2000 个后代
const DEFAULT_RETRY_WAIT_MS = 5000;
const MAX_RETRY_WAIT_SECONDS = 10; // 等待上限，防止服务端给过大的 Retry-After
const MAX_PART_ATTEMPTS = 3; // 单个分片的最大尝试次数（网络错误/503）
const PART_RETRY_WAIT_MS = 1000; // 分片重试的默认间隔（503 优先用服务端 Retry-After）

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function xhrFetch(
  url: RequestInfo | URL,
  requestInit: RequestInit & {
    onUploadProgress?: (progressEvent: ProgressEvent) => void;
  }
) {
  return new Promise<Response>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = requestInit.onUploadProgress ?? null;
    xhr.open(
      requestInit.method ?? "GET",
      url instanceof Request ? url.url : url
    );
    const headers = new Headers(requestInit.headers);
    for (const [key, value] of Object.entries(createAuthHeaders()))
      headers.set(key, value);
    // 网页端标记：避免服务端对 401 下发 WWW-Authenticate 触发原生登录框
    headers.set("X-FlareDrive-Web", "1");
    headers.forEach((value, key) => xhr.setRequestHeader(key, value));
    xhr.onload = () => {
      const headers = xhr
        .getAllResponseHeaders()
        .trim()
        .split("\r\n")
        .filter(Boolean)
        .reduce((acc, header) => {
          // 值本身可能含 ": "（如 Date），只在第一个分隔处切开
          const [key, ...rest] = header.split(": ");
          acc[key.toLowerCase()] = rest.join(": ");
          return acc;
        }, {} as Record<string, string>);
      if (xhr.status === 401) notifyUnauthorized();
      resolve(new Response(xhr.responseText, { status: xhr.status, headers }));
    };
    // reject 一个真正的 Error（此前 reject ProgressEvent，
    // UI 上会显示 "[object ProgressEvent]"）
    xhr.onerror = () =>
      reject(
        appError(
          "networkError",
          `Network error during ${requestInit.method ?? "GET"} ${url}`
        )
      );
    if (
      requestInit.body instanceof Blob ||
      typeof requestInit.body === "string"
    ) {
      xhr.send(requestInit.body);
    } else {
      // 不调用 send 会让 Promise 永不落定（卡死上传队列）：显式失败
      reject(
        appError(
          "networkError",
          "xhrFetch: unsupported request body type (expected Blob or string)"
        )
      );
    }
  });
}

export async function multipartUpload(
  key: string,
  file: File,
  options?: {
    headers?: Record<string, string>;
    onUploadProgress?: (progressEvent: {
      loaded: number;
      total: number;
    }) => void;
  }
) {
  const headers = options?.headers || {};
  headers["content-type"] = file.type;

  const uploadResponse = await webdavFetch(`/webdav/${encodeKey(key)}?uploads`, {
    headers,
    method: "POST",
  });
  if (!uploadResponse.ok) {
    throw appError(
      "transferFailed",
      `Failed to create multipart upload (status ${uploadResponse.status})`,
      { action: "upload", status: uploadResponse.status },
      uploadResponse.status
    );
  }
  const { uploadId } = await uploadResponse.json<{ uploadId: string }>();
  if (!uploadId) throw appError("invalidResponse", "Missing uploadId");

  // 失败时中止未完成的 multipart 上传，避免 R2 残留孤儿分块
  const abortUpload = async () => {
    const abortParams = new URLSearchParams({ uploadId });
    await webdavFetch(`/webdav/${encodeKey(key)}?${abortParams}`, {
      method: "DELETE",
    }).catch(() => {});
  };

  try {
    const totalChunks = Math.ceil(file.size / SIZE_LIMIT);

    const limit = pLimit(2);
    const parts = Array.from({ length: totalChunks }, (_, i) => i + 1);
    const partsLoaded = Array.from({ length: totalChunks + 1 }, () => 0);
    const promises = parts.map((i) =>
      limit(async () => {
        const chunk = file.slice((i - 1) * SIZE_LIMIT, i * SIZE_LIMIT);
        const searchParams = new URLSearchParams({
          partNumber: i.toString(),
          uploadId,
        });
        const uploadUrl = `/webdav/${encodeKey(key)}?${searchParams}`;
        // workaround: 紧邻的并发分块上传偶发时序/限流问题，在第 2 块（并发上限处）稍作停顿
        if (i === limit.concurrency) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        const uploadPart = () =>
          xhrFetch(uploadUrl, {
            method: "PUT",
            headers,
            body: chunk,
            onUploadProgress: (progressEvent) => {
              partsLoaded[i] = progressEvent.loaded;
              options?.onUploadProgress?.({
                loaded: partsLoaded.reduce((a, b) => a + b),
                total: file.size,
              });
            },
          });

        const uploadPartWithRetry =
          async (): Promise<{ partNumber: number; etag: string }> => {
            for (let attempt = 1; ; attempt++) {
              let res: Response;
              try {
                res = await uploadPart();
              } catch (error) {
                // 网络错误：重试机会用尽前再试
                if (attempt >= MAX_PART_ATTEMPTS) throw error;
                await sleep(PART_RETRY_WAIT_MS);
                continue;
              }
              if (!res.ok) {
                // 仅 503（服务端子请求预算限流）对同一分片原地重试；
                // 其余失败此前被当作成功（etag=null），直到 complete 才报错，
                // 并触发整个文件从头重传——现在直接中止，由任务级重试接管
                if (res.status !== 503 || attempt >= MAX_PART_ATTEMPTS)
                  throw appError(
                    "transferFailed",
                    `Uploading part ${i} failed with status ${res.status}`,
                    { action: "upload", status: res.status },
                    res.status
                  );
                const retryAfter = Number(res.headers.get("retry-after"));
                await sleep(
                  Number.isFinite(retryAfter) && retryAfter > 0
                    ? Math.min(retryAfter, MAX_RETRY_WAIT_SECONDS) * 1000
                    : DEFAULT_RETRY_WAIT_MS
                );
                continue;
              }
              const etag = res.headers.get("etag");
              if (!etag)
                throw appError(
                  "invalidResponse",
                  `Part ${i} response is missing etag`
                );
              return { partNumber: i, etag };
            }
          };

        return uploadPartWithRetry();
      })
    );
    const uploadedParts = await Promise.all(promises);
    const completeParams = new URLSearchParams({ uploadId });
    const response = await webdavFetch(
      `/webdav/${encodeKey(key)}?${completeParams}`,
      {
        method: "POST",
        body: JSON.stringify({ parts: uploadedParts }),
      }
    );
    if (!response.ok) throw new Error(await response.text());
    return response;
  } catch (error) {
    // 任一分块或 complete 失败：清理已创建但未完成的 multipart 上传
    await abortUpload();
    throw error;
  }
}

export async function copyPaste(
  source: string,
  target: string,
  move = false,
  dontOverwrite = false
) {
  const uploadUrl = `${WEBDAV_ENDPOINT}${encodeKey(source)}`;
  const destinationUrl = new URL(
    `${WEBDAV_ENDPOINT}${encodeKey(target)}`,
    window.location.href
  );
  const doRequest = () =>
    webdavFetch(uploadUrl, {
      method: move ? "MOVE" : "COPY",
      headers: {
        Destination: destinationUrl.href,
        ...(dontOverwrite ? { Overwrite: "F" } : {}),
      },
    });

  // 目录复制是分批的（免费套餐子请求预算）：服务端返回 503 + Retry-After，
  // COPY 需重试直至完成（已复制的目标会被跳过，幂等）。MOVE 不自动重试：
  // 服务端自身会重试删除源，且带 Overwrite: F 时重试会因目标已存在而 412。
  let response = await doRequest();
  if (!move) {
    let attempts = 0;
    while (response.status === 503 && attempts < MAX_COPY_RETRIES) {
      const retryAfter = Number(response.headers?.get?.("retry-after"));
      const wait =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter, MAX_RETRY_WAIT_SECONDS) * 1000
          : DEFAULT_RETRY_WAIT_MS;
      await sleep(wait);
      response = await doRequest();
      attempts++;
    }
  }
  if (!response.ok) {
    const error = appError(
      "transferFailed",
      `${move ? "Move" : "Copy"} failed with status ${response.status}`,
      { action: move ? "move" : "copy", status: response.status },
      response.status
    );
    throw error;
  }
}

/** 删除一个或多个文件/目录。目录删除是分批的：服务端每次调用最多删 40 个
 *  对象，超出返回 503 + Retry-After（删除幂等，重复调用安全），这里循环重试
 *  直至完成。非 503 的失败会收集并在最后抛出，不影响其余条目的删除。 */
export async function deletePaths(paths: string[]) {
  const errors: Error[] = [];
  for (const path of paths) {
    try {
      let attempts = 0;
      for (;;) {
        const response = await webdavFetch(`/webdav/${encodeKey(path)}`, {
          method: "DELETE",
        });
        if (response.status === 503) {
          if (++attempts >= MAX_DELETE_RETRIES) {
            errors.push(
              appError(
                "deleteTimedOut",
                `Delete timed out after ${attempts} retries: ${path}`,
                { attempts, path }
              )
            );
            break;
          }
          const retryAfter = Number(response.headers?.get?.("retry-after"));
          const wait =
            Number.isFinite(retryAfter) && retryAfter > 0
              ? Math.min(retryAfter, MAX_RETRY_WAIT_SECONDS) * 1000
              : DEFAULT_RETRY_WAIT_MS;
          await sleep(wait);
          continue;
        }
        if (!response.ok) {
          // 404 = 资源已不存在（服务端现已按 RFC 返回 404）：删除幂等，视为成功
          if (response.status !== 404) {
            errors.push(
              appError(
                "deleteFailed",
                `Delete failed: ${path} (${response.status})`,
                { path, status: response.status }
              )
            );
          }
        }
        break;
      }
    } catch (error) {
      errors.push(error as Error);
    }
  }
  if (errors.length) throw errors[0];
}

/** 创建目录（纯 API，不做任何原生弹窗；名称校验失败时抛错） */
export async function createFolderAt(cwd: string, folderName: string) {
  if (!folderName || folderName.includes("/"))
    throw appError("invalidFolderName", "Invalid folder name");
  const folderKey = `${cwd}${folderName}`;
  const uploadUrl = `${WEBDAV_ENDPOINT}${encodeKey(folderKey)}`;
  const response = await webdavFetch(uploadUrl, { method: "MKCOL" });
  if (!response.ok)
    throw appError(
      "createFolderFailed",
      `Create folder failed with status ${response.status}`,
      { status: response.status }
    );
}

export async function processTransferTask({
  task,
  onTaskProgress,
}: {
  task: TransferTask;
  onTaskProgress?: (event: { loaded: number; total: number }) => void;
}) {
  const { remoteKey, file } = task;
  if (task.type !== "upload" || !file)
    throw appError("invalidTask", "Invalid task");
  let thumbnailDigest = null;

  if (
    file.type.startsWith("image/") ||
    file.type === "video/mp4" ||
    file.type === "application/pdf"
  ) {
    try {
      const thumbnailBlob = await generateThumbnail(file);
      const digestHex = await blobDigest(thumbnailBlob);

      const thumbnailUploadUrl = `/webdav/_$flaredrive$/thumbnails/${digestHex}.png`;
      try {
        await webdavFetch(thumbnailUploadUrl, {
          method: "PUT",
          body: thumbnailBlob,
        });
        thumbnailDigest = digestHex;
      } catch (error) {
        console.log(`Upload ${digestHex}.png failed`);
      }
    } catch (error) {
      console.log(`Generate thumbnail failed`);
    }
  }

  const headers: { "fd-thumbnail"?: string } = {};
  if (thumbnailDigest) headers["fd-thumbnail"] = thumbnailDigest;
  if (file.size >= SIZE_LIMIT) {
    return await multipartUpload(remoteKey, file, {
      headers,
      onUploadProgress: onTaskProgress,
    });
  } else {
    const uploadUrl = `${WEBDAV_ENDPOINT}${encodeKey(remoteKey)}`;
    return await xhrFetch(uploadUrl, {
      method: "PUT",
      headers,
      body: file,
      onUploadProgress: onTaskProgress,
    });
  }
}
