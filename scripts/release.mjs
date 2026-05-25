#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const version = String(process.argv[2] || "").trim();

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  fail("Usage: pnpm release <version>");
}

run("pnpm", ["test"]);
run("pnpm", ["check"]);

updateManifest(version);
createZip(version);

console.log(`Release package created at ~/Downloads/vuoropaivittaja-${version}.zip`);

function updateManifest(nextVersion) {
  const manifestPath = join(process.cwd(), "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.version = nextVersion;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function createZip(nextVersion) {
  const downloadsDir = join(homedir(), "Downloads");
  mkdirSync(downloadsDir, { recursive: true });
  const zipPath = join(downloadsDir, `vuoropaivittaja-${nextVersion}.zip`);

  const listedFiles = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    }
  );

  if (listedFiles.status !== 0) {
    fail("Could not list files for packaging.");
  }

  const files = listedFiles.stdout.split("\0").filter(Boolean);

  const zip = spawnSync("zip", ["-q", zipPath, "-@"], {
    cwd: process.cwd(),
    input: `${files.join("\n")}\n`,
    encoding: "utf8",
  });

  if (zip.status !== 0) {
    fail("Zip creation failed.");
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
