import { describe, expect, it } from "vitest";
import { FetchRefused, isForbiddenIp, safeFetch } from "./ssrf.ts";

describe("isForbiddenIp", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"])(
    "refuse %s", (ip) => expect(isForbiddenIp(ip)).toBe(true));
  it.each(["93.184.216.34", "1.1.1.1", "2606:4700:4700::1111", "172.32.0.1"])("accepte %s", (ip) => expect(isForbiddenIp(ip)).toBe(false));
});

describe("safeFetch", () => {
  it.each([
    ["http://127.0.0.1/", "private_address"],
    ["http://169.254.169.254/latest/meta-data", "private_address"],
    ["http://localhost/", "private_address"],
    ["file:///etc/passwd", "scheme"],
    ["http://example.com:8080/", "port"],
    ["http://user:pw@example.com/", "credentials"],
  ])("refuse %s (%s)", async (url, reason) => {
    await expect(safeFetch(url)).rejects.toThrow(new FetchRefused(reason));
  });
});
