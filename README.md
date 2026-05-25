# Vuoropäivittäjä

Chrome extension for monitoring appointment slot lists and alerting when the visible list changes.

## What it does

- Watches one active tab at a time.
- Clicks a configured refresh control on a random interval.
- Compares the visible slot list before and after refresh.
- Notifies the user with a desktop notification and optional sound.
- Stores slot history locally in `chrome.storage.local`.

## Requirements

- Chrome 120 or newer
- `pnpm`
- No build step is required; the extension loads plain ES2020+ scripts directly

## Repository layout

- `src/background.js` - background worker for alerts, storage updates, and offscreen audio
- `src/content.js` - monitoring logic that runs in the page
- `src/content-helpers.js` - pure helpers used by the content script and tests
- `src/*.test.js` - colocated unit tests for the runtime modules
- `popup.html`, `src/popup.js`, `popup.css` - extension popup UI
- `src/shared.js` - shared state and helpers exposed to both browser scripts and tests
- `test-page/` - local test page for manual verification
- `SPEC.md` - product and implementation contract

## Development

Install dependencies:

```bash
pnpm install
```

Run the test suite:

```bash
pnpm test
```

Run static checks:

```bash
pnpm check
```

Lint only:

```bash
pnpm lint
```

Format the repository:

```bash
pnpm format
```

Serve the local test page:

```bash
pnpm serve
```

## Loading the extension locally

See [ASENNUS.md](./ASENNUS.md) for the end-user installation steps in Finnish.

## Notes for contributors

- All user-facing UI text must remain in Finnish.
- Developer-facing code, logs, and identifiers should remain in English.
- Keep `SPEC.md` updated when behavior changes.
- Prefer small, testable helpers over browser-specific logic.

## Releasing
