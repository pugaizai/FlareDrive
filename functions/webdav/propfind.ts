import {
  listAll,
  RequestHandlerParams,
  ROOT_OBJECT,
  WEBDAV_ENDPOINT,
} from "./utils";

type DavProperties = {
  creationdate: string | undefined;
  displayname: string | undefined;
  getcontentlanguage: string | undefined;
  getcontentlength: string | undefined;
  getcontenttype: string | undefined;
  getetag: string | undefined;
  getlastmodified: string | undefined;
  resourcetype: string;
  "fd:thumbnail": string | undefined;
};

function fromR2Object(object: R2Object | typeof ROOT_OBJECT): DavProperties {
  return {
    // RFC 4918 要求 creationdate 为 ISO 8601 格式（如 2024-06-20T12:34:56.789Z）
    creationdate: object.uploaded.toISOString(),
    displayname: object.httpMetadata?.contentDisposition,
    getcontentlanguage: object.httpMetadata?.contentLanguage,
    getcontentlength: object.size.toString(),
    getcontenttype: object.httpMetadata?.contentType,
    getetag: object.etag,
    getlastmodified: object.uploaded.toUTCString(),
    resourcetype:
      object.httpMetadata?.contentType === "application/x-directory"
        ? "<collection />"
        : "",
    "fd:thumbnail": object.customMetadata?.thumbnail,
  };
}

// XML 特殊字符转义，防止文件名/元数据破坏响应 XML
function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// 与前端 encodeKey 保持一致：按路径段 encodeURIComponent
function encodeKey(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

async function findChildren({
  bucket,
  path,
  depth,
}: {
  bucket: R2Bucket;
  path: string;
  depth: string;
}) {
  if (!["1", "infinity"].includes(depth)) return [];

  const objects: Array<R2Object> = [];

  const prefix = path === "" ? path : `${path}/`;
  for await (const object of listAll(bucket, prefix, depth === "infinity")) {
    objects.push(object);
  }

  return objects;
}

export async function handleRequestPropfind({
  bucket,
  path,
  request,
}: RequestHandlerParams) {
  const responseTemplate = `<?xml version="1.0" encoding="utf-8" ?>
<multistatus xmlns="DAV:" xmlns:fd="flaredrive">
{{items}}
</multistatus>`;

  const rootObject = path === "" ? ROOT_OBJECT : await bucket.head(path);
  if (!rootObject) return new Response("Not found", { status: 404 });
  const isDirectory =
    rootObject === ROOT_OBJECT ||
    rootObject.httpMetadata?.contentType === "application/x-directory";
  const depth = request.headers.get("Depth") ?? "infinity";

  const children = !isDirectory
    ? []
    : await findChildren({
        bucket,
        path,
        depth,
      });

  const items = [rootObject, ...children].map((child) => {
    const properties = fromR2Object(child);
    return `
  <response>
    <href>${escapeXml(`${WEBDAV_ENDPOINT}${encodeKey(child.key)}`)}</href>
    <propstat>
      <prop>
        ${Object.entries(properties)
          .filter(([_, value]) => value !== undefined)
          .map(([key, value]) => {
            if (value === undefined) return "";
            return `<${key}>${
              // resourcetype 本身就是 XML 标记，不能整体转义
              key === "resourcetype" ? value : escapeXml(value)
            }</${key}>`;
          })
          .join("\n")}
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>`;
  });

  return new Response(responseTemplate.replace("{{items}}", items.join("")), {
    status: 207,
    headers: { "Content-Type": "application/xml" },
  });
}
