// fetchPath：PROPFIND 响应 XML 的解析（含当前目录过滤、解码、缩略图元数据）
import { fetchPath } from "../app/transfer";
import { webdavFetch } from "../app/auth";

jest.mock("../app/auth", () => ({
  webdavFetch: jest.fn(),
  createAuthHeaders: () => ({}),
  notifyUnauthorized: jest.fn(),
}));

// p-limit 是 ESM-only 包，jest 27 无法转换，用即时执行的简单实现替代
jest.mock("p-limit", () => (concurrency: number) => {
  const limiter = (fn: () => unknown) => fn();
  limiter.concurrency = concurrency;
  return limiter;
});

const mockWebdavFetch = webdavFetch as jest.Mock;

const XML = `<?xml version="1.0" encoding="utf-8" ?>
<multistatus xmlns="DAV:" xmlns:fd="flaredrive">
  <response>
    <href>/webdav/</href>
    <propstat>
      <prop>
        <resourcetype><collection /></resourcetype>
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
  <response>
    <href>/webdav/a%26b.txt</href>
    <propstat>
      <prop>
        <getcontenttype>text/plain</getcontenttype>
        <getcontentlength>42</getcontentlength>
        <getlastmodified>Wed, 20 Jun 2024 12:00:00 GMT</getlastmodified>
        <fd:thumbnail>thumb1</fd:thumbnail>
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
</multistatus>`;

beforeEach(() => {
  mockWebdavFetch.mockReset();
  mockWebdavFetch.mockResolvedValue({
    ok: true,
    headers: {
      get: (name: string) =>
        name === "Content-Type" ? "application/xml" : null,
    },
    text: async () => XML,
  });
});

it("parses PROPFIND responses, filtering out the directory itself", async () => {
  const items = await fetchPath("");
  expect(mockWebdavFetch).toHaveBeenCalledWith(
    "/webdav/",
    expect.objectContaining({ method: "PROPFIND" })
  );
  expect(items).toHaveLength(1);
  expect(items[0].key).toBe("a&b.txt"); // 按段编码后的 %26 已解码
  expect(items[0].size).toBe(42);
  expect(items[0].customMetadata?.thumbnail).toBe("thumb1");
});
