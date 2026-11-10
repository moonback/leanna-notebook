const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { afterEach, test } = require("node:test");

const script = path.resolve(__dirname, "../scripts/write-build-config.cjs");
const output = path.resolve(__dirname, "../dist/build-config.json");

afterEach(() => {
  fs.rmSync(output, { force: true });
});

function run(value) {
  const env = { ...process.env };
  if (value === undefined) delete env.LEANNA_WEB_URL;
  else env.LEANNA_WEB_URL = value;
  return spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env,
  });
}

test("requires a production URL", () => {
  const result = run(undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /LEANNA_WEB_URL est obligatoire/);
});

test("rejects HTTP and URL paths", () => {
  for (const value of ["http://localhost:3000", "https://example.com/notebook", "https://user:pass@example.com"]) {
    const result = run(value);
    assert.notEqual(result.status, 0, value);
  }
});

test("writes only the public HTTPS origin", () => {
  const result = run("https://notebook.example.com/");
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(output, "utf8")), {
    webUrl: "https://notebook.example.com",
  });
});
