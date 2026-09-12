import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const assetPattern = /^assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8,}\.(js|css)$/;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

function directory(path) {
  if (!lstatSync(path).isDirectory())
    throw new Error(`Not a regular directory: ${path}`);
}

function collectDist(root) {
  const dist = join(root, "dist");
  directory(dist);
  const files = new Map();
  function visit(relative = "") {
    for (const name of readdirSync(join(dist, relative))) {
      const path = relative ? `${relative}/${name}` : name;
      const stat = lstatSync(join(dist, path));
      if (stat.isDirectory() && ["assets", ".vite"].includes(path)) {
        visit(path);
      } else if (
        stat.isFile() &&
        (["index.html", "index.php", ".vite/license.md"].includes(path) ||
          assetPattern.test(path))
      ) {
        const bytes = readFileSync(join(dist, path));
        if (!bytes.length) throw new Error(`Empty release file: ${path}`);
        files.set(path, bytes);
      } else {
        throw new Error(`Unexpected release file or symlink: ${path}`);
      }
    }
  }
  visit();
  for (const path of ["index.html", "index.php", ".vite/license.md"]) {
    if (!files.has(path)) throw new Error(`Missing release file: ${path}`);
  }
  const html = files.get("index.html").toString("utf8");
  const references = [
    ...html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi),
  ].map((match) => match[1]);
  if (
    !references.some((path) => path.endsWith(".js")) ||
    !references.some((path) => path.endsWith(".css"))
  ) {
    throw new Error("HTML must reference built JS and CSS assets");
  }
  for (const reference of references) {
    if (
      !reference.startsWith("./") ||
      !assetPattern.test(reference.slice(2)) ||
      !files.has(reference.slice(2))
    ) {
      throw new Error(`Invalid or missing HTML asset: ${reference}`);
    }
  }
  files.set("THIRD-PARTY-NOTICES.txt", files.get(".vite/license.md"));
  for (const path of files.keys()) {
    if (assetPattern.test(path) && !references.includes(`./${path}`)) {
      throw new Error(`Unreferenced release asset: ${path}`);
    }
  }
  files.delete(".vite/license.md");
  return new Map([...files].sort(([a], [b]) => a.localeCompare(b)));
}

// The npm command runs all checks/build first. This function packages that build;
// it does not grant deployment permission or certify a dirty tree as a commit.
export function packageRelease(root) {
  root = resolve(root);
  const files = collectDist(root);
  const git = {
    revision: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    dirty:
      execFileSync(
        "git",
        ["status", "--porcelain", "--untracked-files=normal"],
        { cwd: root, encoding: "utf8" },
      ).trim().length > 0,
  };
  for (const relative of [".superpowers", ".superpowers/releases"]) {
    const path = join(root, relative);
    try {
      mkdirSync(path);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    directory(path);
  }
  const output = mkdtempSync(
    join(
      root,
      ".superpowers/releases",
      `crm-cleaner-${git.revision.slice(0, 12)}-`,
    ),
  );
  const staging = mkdtempSync(join(output, "staging-"));
  const archive = join(output, "crm-cleaner.zip");
  const checksum = join(output, "SHA256SUMS");
  const manifest = join(output, "manifest.json");
  try {
    mkdirSync(join(staging, "assets"));
    for (const [path, bytes] of files)
      writeFileSync(join(staging, path), bytes, { flag: "wx" });
    const temporaryArchive = join(staging, "archive.zip");
    execFileSync("zip", ["-q", "-X", temporaryArchive, ...files.keys()], {
      cwd: staging,
    });
    execFileSync("unzip", ["-tq", temporaryArchive]);
    const archiveBytes = readFileSync(temporaryArchive);
    // Exclusive creation prevents overwriting even if an output already exists.
    writeFileSync(archive, archiveBytes, { flag: "wx" });
    const sha256 = hash(archiveBytes);
    writeFileSync(checksum, `${sha256}  crm-cleaner.zip\n`, { flag: "wx" });
    writeFileSync(
      manifest,
      `${JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          git,
          archive: { path: "crm-cleaner.zip", sha256 },
          files: [...files].map(([path, bytes]) => ({
            path,
            bytes: bytes.length,
            sha256: hash(bytes),
          })),
        },
        null,
        2,
      )}\n`,
      { flag: "wx" },
    );
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  return { archive, checksum, manifest };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(
      JSON.stringify(
        packageRelease(fileURLToPath(new URL("..", import.meta.url))),
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(`Release packaging failed: ${error.message}`);
    process.exitCode = 1;
  }
}
