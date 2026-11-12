const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isSafeBrowserUrl,
  resolveBrowserAddress,
  normalizeBrowserBounds,
  isSafeBrowserPermissionOrigin,
} = require("../dist/browser/browser-validation.js");

test("Browser accepts only credential-free HTTP(S) URLs", () => {
  assert.equal(isSafeBrowserUrl("https://example.com/a"), true);
  assert.equal(isSafeBrowserUrl("http://localhost:3000"), true);
  for (const value of [
    "javascript:alert(1)", "data:text/html,hello", "file:///etc/passwd",
    "chrome://settings", "https://user:secret@example.com", "https://",
    "https://example.com/\nheader", null, 42,
  ]) assert.equal(isSafeBrowserUrl(value), false, String(value));
});

test("address resolver distinguishes URLs, hosts and search queries", () => {
  assert.equal(resolveBrowserAddress("https://example.com"), "https://example.com/");
  assert.equal(resolveBrowserAddress("example.com/docs"), "https://example.com/docs");
  assert.equal(resolveBrowserAddress("localhost:3000"), "https://localhost:3000/");
  assert.equal(resolveBrowserAddress("meilleurs outils IA"), "https://www.google.com/search?q=meilleurs%20outils%20IA");
  assert.equal(resolveBrowserAddress("javascript:alert(1)"), null);
  assert.equal(resolveBrowserAddress(""), null);
});

test("bounds are finite, positive and bounded", () => {
  assert.deepEqual(normalizeBrowserBounds({ x: 1.4, y: 2.6, width: 800, height: 600 }), {
    x: 1, y: 3, width: 800, height: 600,
  });
  for (const value of [
    null, {}, { x: 0, y: 0, width: 0, height: 10 },
    { x: 0, y: 0, width: 10001, height: 10 },
    { x: Infinity, y: 0, width: 10, height: 10 },
  ]) assert.equal(normalizeBrowserBounds(value), null);
});

test("permission origins must be exact HTTP(S) origins", () => {
  assert.equal(isSafeBrowserPermissionOrigin("https://example.com"), true);
  assert.equal(isSafeBrowserPermissionOrigin("https://example.com/path"), false);
  assert.equal(isSafeBrowserPermissionOrigin("file://"), false);
});
