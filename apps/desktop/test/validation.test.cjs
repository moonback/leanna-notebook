const test = require("node:test");
const assert = require("node:assert/strict");
const { isSafeExternalUrl, isAllowedWebUrl, normalizeFilters } = require("../dist/shared/validation.js");

test("external URL validation accepts HTTPS URLs", () => {
  assert.equal(isSafeExternalUrl("https://example.com/path"), true);
});

test("external URL validation rejects non-HTTPS and malformed values", () => {
  for (const value of [
    "http://example.com",
    "file:///C:/secret.txt",
    "javascript:alert(1)",
    "https://user:password@example.com/path",
    "https://",
    "//example.com",
    "",
    null,
    42,
  ]) {
    assert.equal(isSafeExternalUrl(value), false, String(value));
  }
});

test("application URL allows HTTPS and local development only", () => {
  assert.equal(isAllowedWebUrl("https://notebook.example.com"), true);
  assert.equal(isAllowedWebUrl("http://127.0.0.1:3000"), true);
  assert.equal(isAllowedWebUrl("http://localhost:3000"), true);
  assert.equal(isAllowedWebUrl("http://[::1]:3000"), true);
  assert.equal(isAllowedWebUrl("http://notebook.example.com"), false);
  assert.equal(isAllowedWebUrl("http://127.0.0.1:3000", false), false);
  assert.equal(isAllowedWebUrl("https://user:pass@example.com"), false);
  assert.equal(isAllowedWebUrl("file:///C:/app/index.html"), false);
});

test("external URL validation rejects oversized values", () => {
  assert.equal(isSafeExternalUrl(`https://example.com/${"a".repeat(2048)}`), false);
});

test("file filters keep valid entries and discard malformed entries", () => {
  assert.deepEqual(normalizeFilters([
    { name: "Documents PDF", extensions: ["pdf"] },
    { name: "Invalid", extensions: ["pdf", "../secret"] },
    { name: "Empty extensions", extensions: [] },
    { name: "   ", extensions: ["pdf"] },
    null,
    { name: "Images", extensions: ["png", "jpg"] },
  ]), [
    { name: "Documents PDF", extensions: ["pdf"] },
    { name: "Images", extensions: ["png", "jpg"] },
  ]);
});

test("file filters enforce entry and extension limits", () => {
  const tooManyExtensions = { name: "Too many", extensions: Array(31).fill("pdf") };
  const tooManyFilters = Array.from({ length: 13 }, (_, index) => ({
    name: `Filter ${index}`,
    extensions: ["pdf"],
  }));
  assert.deepEqual(normalizeFilters([tooManyExtensions]), []);
  assert.equal(normalizeFilters(tooManyFilters).length, 12);
});

test("file filter names are bounded", () => {
  const result = normalizeFilters([{ name: "n".repeat(100), extensions: ["pdf"] }]);
  assert.equal(result[0].name.length, 80);
});
