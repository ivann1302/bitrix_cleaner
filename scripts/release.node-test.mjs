import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { packageRelease } from "./release.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "crm-release-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "dist/assets"), { recursive: true });
  mkdirSync(join(root, "dist/.vite"));
  writeFileSync(
    join(root, "dist/index.html"),
    '<script type="module" src="./assets/index-12345678.js"></script><link rel="stylesheet" href="./assets/index-12345678.css">',
  );
  writeFileSync(
    join(root, "dist/index.php"),
    "<?php readfile(__DIR__ . '/index.html');",
  );
  writeFileSync(
    join(root, "dist/assets/index-12345678.js"),
    "console.log('fixture');",
  );
  writeFileSync(
    join(root, "dist/assets/index-12345678.css"),
    "body { color: black; }",
  );
  writeFileSync(
    join(root, "dist/.vite/license.md"),
    "# Bundled licenses\nMIT License\nCopyright fixture\n",
  );
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", [
    "-C",
    root,
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "--allow-empty",
    "-qm",
    "fixture",
  ]);
  return root;
}

test("archive contains only public files; manifest and hashes describe the exact bytes", (t) => {
  const root = fixture(t);
  const result = packageRelease(root);
  const names = execFileSync("unzip", ["-Z1", result.archive], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .sort();
  assert.deepEqual(names, [
    "THIRD-PARTY-NOTICES.txt",
    "assets/index-12345678.css",
    "assets/index-12345678.js",
    "index.html",
    "index.php",
  ]);
  const manifest = JSON.parse(readFileSync(result.manifest, "utf8"));
  assert.equal(manifest.git.dirty, true);
  assert.match(manifest.git.revision, /^[a-f0-9]{40}$/);
  for (const entry of manifest.files) {
    const bytes = execFileSync("unzip", ["-p", result.archive, entry.path]);
    assert.equal(
      entry.sha256,
      createHash("sha256").update(bytes).digest("hex"),
    );
    assert.equal(entry.bytes, bytes.length);
  }
  const digest = createHash("sha256")
    .update(readFileSync(result.archive))
    .digest("hex");
  assert.equal(manifest.archive.sha256, digest);
  assert.match(
    readFileSync(result.checksum, "utf8"),
    new RegExp(`^${digest}  crm-cleaner.zip\\n$`),
  );
  const second = packageRelease(root);
  assert.notEqual(second.archive, result.archive);
  assert.equal(
    createHash("sha256").update(readFileSync(result.archive)).digest("hex"),
    digest,
  );
});

for (const [name, mutate] of [
  ["missing entry page", (root) => rmSync(join(root, "dist/index.php"))],
  [
    "unexpected hashed asset",
    (root) =>
      writeFileSync(join(root, "dist/assets/secrets-12345678.js"), "secret"),
  ],
  [
    "symlinked output directory",
    (root) => symlinkSync(root, join(root, ".superpowers")),
  ],
  [
    "missing referenced asset",
    (root) => rmSync(join(root, "dist/assets/index-12345678.js")),
  ],
  [
    "repository content",
    (root) => writeFileSync(join(root, "dist/package.json"), "{}"),
  ],
  [
    "source map",
    (root) =>
      writeFileSync(join(root, "dist/assets/index-12345678.js.map"), "{}"),
  ],
  [
    "empty asset",
    (root) => writeFileSync(join(root, "dist/assets/index-12345678.js"), ""),
  ],
  [
    "symlink",
    (root) => {
      rmSync(join(root, "dist/index.php"));
      symlinkSync("../package.json", join(root, "dist/index.php"));
    },
  ],
  [
    "traversal reference",
    (root) =>
      writeFileSync(
        join(root, "dist/index.html"),
        '<script src="./assets/../../secret.js"></script>',
      ),
  ],
  [
    "external reference",
    (root) =>
      writeFileSync(
        join(root, "dist/index.html"),
        '<script src="https://example.invalid/app.js"></script>',
      ),
  ],
  ["missing licenses", (root) => rmSync(join(root, "dist/.vite/license.md"))],
]) {
  test(`refuses ${name}`, (t) => {
    const root = fixture(t);
    mutate(root);
    assert.throws(() => packageRelease(root));
  });
}
