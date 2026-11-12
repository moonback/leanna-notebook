import { describe, expect, it } from "vitest";
import { isTikTokUrl } from "./tiktok";

describe("isTikTokUrl", () => {
  it.each(["https://www.tiktok.com/@creator/video/123", "https://vm.tiktok.com/ZM123/", "https://vt.tiktok.com/ZS123/", "https://m.tiktok.com/v/123.html"])(
    "accepts %s", (url) => expect(isTikTokUrl(url)).toBe(true));
  it.each(["http://www.tiktok.com/@creator/video/123", "https://tiktok.com.evil.example/video/1", "https://evil.example/?url=https://www.tiktok.com", "https://user:pass@www.tiktok.com/video/1", "https://www.tiktok.com:8443/video/1", "not a URL"])(
    "rejects %s", (url) => expect(isTikTokUrl(url)).toBe(false));
});
