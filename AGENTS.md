# Project Rules

## Tooling

- Use `pnpm` project scripts (`pnpm test`, `pnpm lint`, `pnpm check`, `pnpm format`).

## Commits

- Commit only when explicitly requested.
- Use Conventional Commits: `type: description` (no scope).
  - Allowed types: `feat`, `fix`, `refactor`, `docs`, `chore`
- Keep subject lines under 72 characters.
- Do not add co-author trailers.

## Code

- All user-facing strings must be in Finnish.
- No build step — plain ES2020+ scripts loaded directly by Chrome.
- Tests use `node --test` (built-in). Run with `pnpm test`.
- `shared.js` exports to both `globalThis.VuoropaivittajaShared` and `module.exports`.
- Keep `SPEC.md` current with behavior changes in the same slice when practical.
