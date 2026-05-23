# Vuoropäivittäjä — Feature Specification

## Overview

Vuoropäivittäjä is a Chrome extension that monitors a booking or scheduling page for newly available slots. It clicks a configured refresh button at a random interval, compares the page content before and after each click, and notifies the user (desktop notification and/or sound) when the content changes — indicating that new slots may have appeared.

The extension is configured once for a single URL and button, then runs silently in the background. The popup is a simple settings panel, not a rule manager.

### Out of scope (future)

- Listing or storing found slots.
- History of past notifications.
- Multiple monitored sites simultaneously.
- Sound or notification testing (e.g. "test audio" button).
- Manual URL text input — the URL is always taken from the active tab.

---

## Platform

- Chrome Extension, Manifest Version 3
- Minimum Chrome version: 120
- No build step — plain JavaScript files loaded directly by Chrome
- No external dependencies

---

## Data Model

All persistent state lives in `chrome.storage.local`.

### Settings object — key `"settings"`

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | boolean | `false` | Master on/off switch for monitoring |
| `notifications` | boolean | `true` | Send a desktop notification when a change is detected |
| `sound` | boolean | `true` | Play an audible alert when a change is detected |
| `minIntervalMs` | number | `30000` | Minimum ms between refresh clicks (min `2000`) |
| `maxIntervalMs` | number | `90000` | Maximum ms between refresh clicks (must be ≥ `minIntervalMs`) |

### Rule object — key `"rule"`

| Field | Type | Default | Description |
|---|---|---|---|
| `urlPattern` | string | `""` | Case-insensitive substring matched against the tab URL |
| `selector` | string | `""` | CSS selector or XPath expression for the button to click |
| `listSelector` | string | `""` | Auto-detected CSS selector for the slot list container; never shown in the UI |
| `targetUrl` | string | `""` | Full URL to reopen if the tab is closed |

A rule with an empty `urlPattern` or empty `selector` is not active.

`listSelector` is derived automatically when the button selector is saved: the content script resolves the button element, walks up its ancestors until it finds one whose subtree contains a `[role="list"]` or `[role="grid"]` that is not inside the button itself, then builds a CSS selector for that element. The result is stored silently in the rule and never exposed in the UI.

### Temporary storage keys

| Key | Purpose | Lifetime |
|---|---|---|
| `lastPickedElement` | Selector written by the element picker | Consumed once when the popup opens |
| `draftRule` | Form state saved before the picker closes the popup | Consumed once when the popup reopens |

---

## Features

### 1. Background monitoring

**As a user**, I want the extension to repeatedly refresh a page and alert me when new slots appear, so I can book immediately without watching the screen.

#### Acceptance criteria

- When `enabled` is `true` and the rule has a valid `urlPattern` and `selector`, the content script sets up a repeating refresh cycle.
- The interval for each cycle is a random value in the range `[minIntervalMs, maxIntervalMs]`, chosen freshly each tick.
- On each tick:
  1. Take a snapshot: if `listSelector` matches an element, collect the `innerText` of each `[role="listitem"]` child as an ordered array; otherwise fall back to `document.body.innerText` as a single-element array.
  2. Click the configured button (see Element clicking below).
  3. Wait a short settle period (1–2 s) for the page to update.
  4. Take a new snapshot using the same source.
  5. If the two snapshots differ (compared as JSON strings), fire a change notification (see Feature 3).
  6. Update the stored baseline to the new snapshot.
- Clicks fire regardless of tab visibility — the extension is designed to run in the background.
- Re-initialisation occurs on URL change (hash, popstate, pushState, replaceState) and on `visibilitychange`.
- The content script guards against running twice per page via a `__vuoropaivittajaLoaded` flag on `globalThis`.

#### Element clicking

- If the selector starts with `/`, `(`, or `./`, it is treated as XPath; otherwise as CSS.
- **CSS**: `querySelector` on `document`, then BFS into shadow roots if not found.
- **XPath**: `document.evaluate` with `FIRST_ORDERED_NODE_TYPE`.
- The element is scrolled into view, focused, then receives: `pointerover`, `mouseover`, `pointerdown`, `mousedown`, `pointerup`, `mouseup`, `click` events, followed by `.click()`.

---

### 2. Tab reopening

**As a user**, I want the page to reopen automatically if its tab is closed, so monitoring is never interrupted.

#### Acceptance criteria

- The background service worker checks the rule on: startup, install, any change to `"settings"` or `"rule"` storage keys, and any tab removal.
- If `enabled` is `true` and the rule has a non-empty `targetUrl`, and no open tab URL matches `urlPattern`, the background opens `targetUrl` in a new active tab.

---

### 3. Notifications

**As a user**, I want to be alerted immediately when a change is detected, so I can act on it quickly.

#### Acceptance criteria

- When a page change is detected and `notifications` is `true`, the extension sends a Chrome desktop notification with the title `"Vuoropäivittäjä"` and body `"Uusia vuoroja saattaa olla saatavilla."` ("New slots may be available.").
- When a page change is detected and `sound` is `true`, the extension plays a short audible alert (a simple beep generated via the Web Audio API — no audio file dependency).
- Both alerts can fire independently (one can be on while the other is off).
- Requires the `notifications` permission in the manifest.

---

### 4. Popup UI

**As a user**, I want a simple settings panel where I can turn monitoring on/off and adjust the interval, so there's no unnecessary complexity.

#### Layout

The popup is a compact single-column panel with two sections:

1. **Settings section** — toggles and interval inputs.
2. **Setup section** — URL pattern, button selector (with picker), and save.

#### Settings section

Controls (rendered as labelled toggle switches):

- **Tarkkailu päällä** — maps to `enabled`. Master switch.
- **Työpöytäilmoitus** — maps to `notifications`. Send desktop notification on change.
- **Äänimerkki** — maps to `sound`. Play audio on change.

Interval inputs (two number fields labelled **Päivitysväli (s)**, side by side, values entered and displayed in **seconds**):

- **Min** — minimum interval in seconds; stored internally as `minIntervalMs = value × 1000`. Minimum value: 2 s.
- **Max** — maximum interval in seconds; stored internally as `maxIntervalMs = value × 1000`. Must be ≥ min.

#### Setup section

Shown below the settings. Allows configuring the monitored page and button.

- **Seurattava sivu** — read-only display of the currently configured `targetUrl`, or `"Ei asetettu"` if unconfigured.
- **Aseta nykyinen sivu** button — sets `urlPattern` to the active tab's origin and `targetUrl` to the full active tab URL. Shows the new URL in the display.
- **Painikkeen valitsin** — text input; accepts CSS or XPath.
  - **Valitse sivulta** button — activates the element picker (saves form state, sends `start-picker` to the tab, closes popup).
  - **Testaa** button — sends a one-shot click of the current selector to the active tab's content script and shows the result (success or error) in the status area. Useful for verifying the selector before enabling monitoring.

A single **Tallenna** button at the bottom persists both settings and setup. Status area shows **Tallennettu** on success or an error message in Finnish.

---

### 5. Element picker

**As a user**, I want to click on the refresh button in the page to auto-detect its selector, so I don't have to write CSS or XPath by hand.

#### Acceptance criteria

- Activating the picker closes the popup and saves form state as a draft.
- The content script overlays the page: a highlight follows the pointer over button-like elements; a fixed hint banner reads `"Vuoropäivittäjä: klikkaa haluamaasi painiketta tai paina Esc peruuttaaksesi"`.
- Only button-like elements are selectable: `button`, `input[type="button"]`, `input[type="submit"]`, `input[type="reset"]`, `[role="button"]`.
- On click: builds a selector, saves `{ selector, url, timestamp }` under `lastPickedElement`, exits picker.
- `Escape` cancels without saving.

#### Selector building priority

1. Indexed XPath `(<xpath>)[n]` if the element has duplicate matches on a preferred attribute or stable class.
2. Unique CSS candidate: `#id`, `tag[attr]`, `tag.class`, or DOM path — first that matches exactly one element.
3. XPath fallback: indexed attribute/class XPath, or absolute path.

**Preferred attributes**: `data-testid`, `data-test`, `data-automation-id`, `aria-label`, `name`, `title`, `type`, `role`.

**Stable identifiers**: no whitespace, no 3+ consecutive digits, not matching `/^f[a-z0-9]+$/i`, not starting with `__`, not containing `buttoncanvas`.

#### State restoration after pick

When the popup reopens: load draft → fill selector from `lastPickedElement` → clear both storage keys → show confirmation status.

---

## Non-functional requirements

- **No build step** — plain ES2020+ scripts; `shared.js` exports to `globalThis.VuoropaivittajaShared` and `module.exports` for Node.js tests.
- **Tests** — shared utility functions covered by `node --test` unit tests.
- **Interval inputs in seconds** — the popup displays and accepts seconds; the extension stores and uses milliseconds internally (`ms = s × 1000`).
- **Interval randomisation** — each tick picks a fresh delay with `Math.floor(Math.random() * (max - min + 1)) + min` ms.
- **URL pattern derivation** — `urlPattern` is set to the origin of the active tab URL (scheme + host + port); `targetUrl` is the full URL. The user never types a URL manually.
- **Change detection** — when `listSelector` matches, snapshots each `[role="listitem"]` child's `innerText` as an array; falls back to `document.body.innerText` as a single-element array. Compared as JSON strings. Designed so individual slot entries can be stored as structured history in a future slice.
- **Shadow DOM** — CSS selector search traverses shadow roots BFS; XPath does not.
- **SPA support** — patches `history.pushState`/`replaceState`, listens to `hashchange` and `popstate`.
- **Idempotent loading** — `__vuoropaivittajaLoaded` guard prevents double-init.
- **Draft persistence** — form state survives the picker round-trip via `draftRule` in storage.
- **Audio** — the alert sound is generated with the Web Audio API (oscillator + gain envelope), no bundled audio file needed.
