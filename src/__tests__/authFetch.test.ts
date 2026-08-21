// webdavFetch：网页端标记头 + Authorization 头
import { webdavFetch, saveCredentials, clearCredentials } from "../app/auth";

beforeEach(() => {
  clearCredentials();
  global.fetch = jest.fn(async () => new Response("", { status: 200 }));
});

it("sends the X-FlareDrive-Web marker and Authorization headers", async () => {
  saveCredentials({ username: "user", password: "pass" });
  await webdavFetch("/webdav/", { method: "PROPFIND" });

  const [, init] = (global.fetch as jest.Mock).mock.calls[0];
  const headers = (init as RequestInit).headers as Headers;
  expect(headers.get("X-FlareDrive-Web")).toBe("1");
  expect(headers.get("Authorization")).toBe(
    "Basic " + btoa("user:pass")
  );
});
