// 缩略图生成回归：解码失败必须 reject（此前只监听 onload，
// 损坏图片的 Promise 永不落定 → 上传队列整体死锁）
import { generateThumbnail } from "../app/transfer";

jest.mock("p-limit", () => (concurrency: number) => {
  const limiter = (fn: () => unknown) => fn();
  limiter.concurrency = concurrency;
  return limiter;
});

// jsdom 未实现 Blob URL API 与 canvas，直接替换原型方法。
// 注意：CRA 的 jest 默认 resetMocks: true 会清掉 jest.fn 的实现，
// 故用普通函数 + 记录数组做断言。
const revokedUrls: string[] = [];
Object.defineProperty(URL, "createObjectURL", {
  writable: true,
  configurable: true,
  value: () => "blob:fake",
});
Object.defineProperty(URL, "revokeObjectURL", {
  writable: true,
  configurable: true,
  value: (url: string) => {
    revokedUrls.push(url);
  },
});
Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  writable: true,
  value: function () {
    return { drawImage: () => {} };
  },
});
Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
  configurable: true,
  writable: true,
  value: function (callback: (blob: Blob | null) => void) {
    callback(new Blob(["thumb"]));
  },
});

// 模拟无法解码的图片：只触发 onerror，不触发 onload
class BrokenImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_: string) {
    setTimeout(() => this.onerror?.(), 0);
  }
}

it("rejects instead of hanging when the image cannot be decoded", async () => {
  // @ts-ignore 替换 jsdom 的 Image 构造器
  global.Image = BrokenImage;

  const file = { type: "image/heic", size: 10 } as unknown as File;
  await expect(generateThumbnail(file)).rejects.toThrow("Image decode failed");
});

it("revokes the temporary blob URL after generating the thumbnail", async () => {
  // 解码成功路径：onload 提供图片，随后 objectURL 必须被回收
  class HealthyImage {
    width = 100;
    height = 100;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_: string) {
      setTimeout(() => this.onload?.(), 0);
    }
  }
  // @ts-ignore
  global.Image = HealthyImage;
  revokedUrls.length = 0;

  const file = { type: "image/png", size: 10 } as unknown as File;
  await generateThumbnail(file);
  expect(revokedUrls).toContain("blob:fake");
});
