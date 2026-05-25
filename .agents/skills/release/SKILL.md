---
name: release
description: Release Vuoropäivittäjä by bumping manifest.json, running checks, and packaging the extension zip.
---

# Vuoropäivittäjä Release

Use this skill when preparing a new release for the Vuoropäivittäjä extension.

## Workflow

1. Keep `CHANGELOG.md` high-signal only: features and bugfixes.
2. Add the next dated version section directly in `CHANGELOG.md`.
3. Run `pnpm release <version> [destinationDir]` from the repo root.

The release script:

- requires a matching dated version section in `CHANGELOG.md`
- bumps `manifest.json`
- runs `pnpm test` and `pnpm check`
- writes `releases/vuoropaivittaja-<version>.zip` by default
- accepts an optional destination directory as the third argument

Version source of truth is `manifest.json`.
