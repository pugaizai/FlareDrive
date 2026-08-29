// 分享 token：HMAC 签名生成与校验
import {
  createShareToken,
  verifyShareToken,
} from "../../functions/webdav/utils";

const SECRET = "test-secret";

it("verifies a freshly created token", async () => {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = await createShareToken(SECRET, "dir/a.txt", expires);
  await expect(
    verifyShareToken(SECRET, "dir/a.txt", token)
  ).resolves.toBe(true);
});

it("rejects an expired token", async () => {
  const expires = Math.floor(Date.now() / 1000) - 10;
  const token = await createShareToken(SECRET, "dir/a.txt", expires);
  await expect(
    verifyShareToken(SECRET, "dir/a.txt", token)
  ).resolves.toBe(false);
});

it("rejects a tampered signature", async () => {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = await createShareToken(SECRET, "dir/a.txt", expires);
  const [exp, sig] = token.split(".");
  await expect(
    verifyShareToken(SECRET, "dir/a.txt", `${exp}.${"0".repeat(sig.length)}`)
  ).resolves.toBe(false);
});

it("rejects a token issued for a different path", async () => {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = await createShareToken(SECRET, "dir/a.txt", expires);
  await expect(
    verifyShareToken(SECRET, "dir/b.txt", token)
  ).resolves.toBe(false);
});

it("rejects malformed tokens", async () => {
  await expect(
    verifyShareToken(SECRET, "dir/a.txt", "not-a-token")
  ).resolves.toBe(false);
  await expect(
    verifyShareToken(SECRET, "dir/a.txt", "123.")
  ).resolves.toBe(false);
});


it("produces a shortened token (signature 14 chars, total under 25)", async () => {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = await createShareToken(SECRET, "dir/a.txt", expires);
  const [exp, sig] = token.split(".");
  expect(sig.length).toBe(14);
  expect(token.length).toBeLessThan(25);
  // 过期时间应为 base36 编码
  expect(parseInt(exp, 36)).toBe(expires);
});
