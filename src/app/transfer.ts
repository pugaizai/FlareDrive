import pLimit from "p-limit";

import { encodeKey, FileItem } from "../FileGrid";
import { webdavFetch, createAuthHeaders, notifyUnauthorized } from "./auth";
import { TransferTask } from "./transferQueue";

const WEBDAV_ENDPOINT = "/webdav/";

export async function fetchPath(path: string) {
  const res = await webdavFetch(`${WEBDAV_ENDPOINT}${encodeKey(path)}`, {
    method: "PROPFIND",
    headers: { Depth: "1" },
  });

  if (!res.ok) throw new Error("Failed to fetch");
  if (!res.headers.get("Content-Type")?.includes("application/xml"))
    throw new Error("Invalid response");

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
      if (!href) throw new Error("Invalid response");
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

export async function generateThumbnail(file: File) {
  const canvas = document.createElement("canvas");
  canvas.width = THUMBNAIL_SIZE;
  canvas.height = THUMBNAIL_SIZE;
  var ctx = canvas.getContext("2d")!;

  if (file.type.startsWith("image/")) {
    const image = await new Promise<HTMLImageElement>((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.src = URL.createObjectURL(file);
    });
    ctx.drawImage(image, 0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE);
  } else if (file.type === "video/mp4") {
    // Generate thumbnail from video
    const video = await new Promise<HTMLVideoElement>(
      async (resolve, reject) => {
        const video = document.createElement("video");
        video.muted = true;
        video.src = URL.createObjectURL(file);
        setTimeout(() => reject(new Error("Video load timeout")), 2000);
        await video.play();
        video.pause();
        video.currentTime = 0;
        resolve(video);
      }
    );
    ctx.drawImage(video, 0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE);
  } else if (file.type === "application/pdf") {
    const pdfjsLib = await import(
      // @ts-ignore
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs"
    );
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";
    const pdf = await pdfjsLib.getDocument(URL.createObjectURL(file)).promise;
    const page = await pdf.getPage(1);
    const { width, height } = page.getViewport({ scale: 1 });
    var scale = THUMBNAIL_SIZE / Math.max(width, height);
    const viewport = page.getViewport({ scale });
    const renderContext = { canvasContext: ctx, viewport };
    await page.render(renderContext).promise;
  }

  const thumbnailBlob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((blob) => resolve(blob!))
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
        .reduce((acc, header) => {
          const [key, value] = header.split(": ");
          acc[key] = value;
          return acc;
        }, {} as Record<string, string>);
      if (xhr.status === 401) notifyUnauthorized();
      resolve(new Response(xhr.responseText, { status: xhr.status, headers }));
    };
    xhr.onerror = reject;
    if (
      requestInit.body instanceof Blob ||
      typeof requestInit.body === "string"
    ) {
      xhr.send(requestInit.body);
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
  const { uploadId } = await uploadResponse.json<{ uploadId: string }>();

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

        const retryReducer = (acc: Promise<Response>) =>
          acc
            .then((res) => {
              const retryAfter = res.headers.get("retry-after");
              if (!retryAfter) return res;
              return uploadPart();
            })
            .catch(uploadPart);
        const response = await [1, 2].reduce(retryReducer, uploadPart());
        return { partNumber: i, etag: response.headers.get("etag")! };
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
    const error = new Error(
      `${move ? "Move" : "Copy"} failed with status ${response.status}`
    ) as Error & { status?: number };
    error.status = response.status;
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
              new Error(
                `Delete timed out after ${attempts} retries: ${path}`
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
          errors.push(
            new Error(`Delete failed: ${path} (${response.status})`)
          );
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
    throw new Error("Invalid folder name");
  const folderKey = `${cwd}${folderName}`;
  const uploadUrl = `${WEBDAV_ENDPOINT}${encodeKey(folderKey)}`;
  const response = await webdavFetch(uploadUrl, { method: "MKCOL" });
  if (!response.ok)
    throw new Error(`Create folder failed with status ${response.status}`);
}

export async function processTransferTask({
  task,
  onTaskProgress,
}: {
  task: TransferTask;
  onTaskProgress?: (event: { loaded: number; total: number }) => void;
}) {
  const { remoteKey, file } = task;
  if (task.type !== "upload" || !file) throw new Error("Invalid task");
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
