// PROPFIND：XML 特殊字符转义 + href 按段编码
import { handleRequestPropfind } from "../../functions/webdav/propfind";

const object = (key: string, extra: Record<string, unknown> = {}) => ({
  key,
  uploaded: new Date("2024-06-20T12:00:00Z"),
  size: 10,
  etag: '"abc"',
  httpMetadata: { contentType: "text/plain" },
  customMetadata: undefined,
  ...extra,
});

function makeBucket(objects: Array<ReturnType<typeof object>>) {
  return {
    head: jest.fn(
      async (path: string) => objects.find((o) => o.key === path) ?? null
    ),
    list: jest.fn(async () => ({ objects, truncated: false })),
  };
}

const request = (depth = "1") =>
  ({
    url: "https://example.com/webdav/",
    headers: { get: (name: string) => (name === "Depth" ? depth : null) },
  } as unknown as Request);

it("escapes XML special characters in property values and hrefs", async () => {
  const bucket = makeBucket([
    object("a&b<c>.txt", { customMetadata: { thumbnail: "t<h&i>" } }),
  ]);

  const response = await handleRequestPropfind({
    bucket,
    path: "",
    request: request("1"),
  } as any);

  expect(response.status).toBe(207);
  const xml = await response.text();
  expect(xml).toContain("a%26b%3Cc%3E.txt"); // href 按段编码，& < > 均已编码
  expect(xml).toContain("t&lt;h&amp;i&gt;"); // thumbnail 已转义
  expect(xml).not.toContain("t<h&i>"); // 不存在未转义原文
});

it("preserves the collection resourcetype markup", async () => {
  const bucket = makeBucket([
    object("sub/", {
      httpMetadata: { contentType: "application/x-directory" },
    }),
  ]);

  const response = await handleRequestPropfind({
    bucket,
    path: "",
    request: request("1"),
  } as any);

  const xml = await response.text();
  expect(xml).toContain("<resourcetype><collection /></resourcetype>");
});
