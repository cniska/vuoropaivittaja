---
name: release
description: Release Vuoropäivittäjä by bumping manifest.json, running checks, and packaging the extension zip.
---

# Vuoropäivittäjä Release

Use this skill when preparing a new release for the Vuoropäivittäjä extension.

## Workflow

1. Keep `CHANGELOG.md` high-signal only: features and bugfixes.
2. Add the next dated version section directly in `CHANGELOG.md`.
3. Run `pnpm release <version>` from the repo root.

The release script:

- bumps `manifest.json`
- runs `pnpm test` and `pnpm check`
- writes `~/Downloads/vuoropaivittaja-<version>.zip`

Version source of truth is `manifest.json`.
