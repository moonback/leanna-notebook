const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { BrowserDataStore } = require("../dist/browser/browser-data-store.js");

test("browser history persists locally and excludes private visits", async () => {
  const directory = await mkdtemp(join(tmpdir(), "leanna-browser-"));
  try {
    const store = new BrowserDataStore(directory);
    await store.addVisit("https://example.com/a", "Example", false);
    await store.addVisit("https://private.example/", "Private", true);
    const history = await new BrowserDataStore(directory).getHistory();
    assert.equal(history.length, 1);
    assert.equal(history[0].url, "https://example.com/a");
    assert.equal(history[0].title, "Example");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("browser bookmarks validate URLs, deduplicate and can be removed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "leanna-browser-"));
  try {
    const store = new BrowserDataStore(directory);
    assert.equal(await store.addBookmark("javascript:alert(1)", "Unsafe"), null);
    const first = await store.addBookmark("https://example.com/", "Example");
    const duplicate = await store.addBookmark("https://example.com/", "Different title");
    assert.ok(first);
    assert.equal(duplicate.id, first.id);
    assert.equal((await store.getBookmarks()).length, 1);
    assert.equal(await store.removeBookmark(first.id), true);
    assert.equal((await store.getBookmarks()).length, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("clearing history does not remove bookmarks", async () => {
  const directory = await mkdtemp(join(tmpdir(), "leanna-browser-"));
  try {
    const store = new BrowserDataStore(directory);
    await store.addVisit("https://example.com/", "Example");
    await store.addBookmark("https://example.com/", "Example");
    await store.clearHistory();
    assert.equal((await store.getHistory()).length, 0);
    assert.equal((await store.getBookmarks()).length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
