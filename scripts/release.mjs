#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const version = String(process.argv[2] || "").trim();
const destinationDir = resolve(
  process.cwd(),
  String(process.argv[3] || "releases").trim() || "releases"
);

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  fail("Usage: pnpm release <version> [destinationDir]");
}

const currentVersion = readManifestVersion();
validateVersionProgress(version, currentVersion);
validateChangelogVersion(version);

run("pnpm", ["test"]);
run("pnpm", ["check"]);

updateManifest(version);
createZip(version, destinationDir);

console.log(
  `Release package created at ${join(
    destinationDir,
    `vuoropaivittaja-${version}.zip`
  )}`
);

function updateManifest(nextVersion) {
  const manifestPath = join(process.cwd(), "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.version = nextVersion;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function readManifestVersion() {
  const manifestPath = join(process.cwd(), "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  return String(manifest.version || "");
}

function validateVersionProgress(nextVersion, currentVersion) {
  if (!currentVersion) {
    return;
  }

  if (compareVersions(nextVersion, currentVersion) < 0) {
    fail(
      `Release version must not be older than manifest.json (${currentVersion}).`
    );
  }
}

function validateChangelogVersion(nextVersion) {
  const changelogPath = join(process.cwd(), "CHANGELOG.md");
  const changelog = readFileSync(changelogPath, "utf8");
  const versionHeader = new RegExp(
    `^## \\[${escapeRegExp(nextVersion)}\\] - \\d{4}-\\d{2}-\\d{2}$`,
    "m"
  );

  if (!versionHeader.test(changelog)) {
    fail(
      `CHANGELOG.md must contain a dated section for ${nextVersion} before releasing.`
    );
  }
}

function createZip(nextVersion, destinationDirPath) {
  mkdirSync(destinationDirPath, { recursive: true });
  const zipPath = join(destinationDirPath, `vuoropaivittaja-${nextVersion}.zip`);

  const files = [
    "manifest.json",
    "popup.html",
    "popup.css",
    "offscreen.html",
    "icon.png",
    "src/background.js",
    "src/content.js",
    "src/content-helpers.js",
    "src/offscreen.js",
    "src/popup.js",
    "src/popup-helpers.js",
    "src/shared.js",
  ];

  const zip = spawnSync("zip", ["-q", zipPath, ...files], {
    cwd: process.cwd(),
  });

  if (zip.status !== 0) {
    fail("Zip creation failed.");
  }
}

function compareVersions(a, b) {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);

  for (let index = 0; index < 3; index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0);
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
