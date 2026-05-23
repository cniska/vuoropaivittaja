# Vuoropäivittäjä — Feature Specification

## Overview

Vuoropäivittäjä is a Chrome extension that automatically clicks a configured button on a matching page at a set interval. Users define rules that pair a URL pattern with an element selector, and the extension clicks that element repeatedly on any tab whose URL matches. Enabled rules also keep their target page open: if the tab is closed, the extension reopens it automatically.

The primary use case is repeatedly clicking a "refresh" or "check availability" button on a booking or scheduling page — for example, checking for newly available appointment slots without manual interaction.

### Out of scope (future)

- Detecting or listing newly available slots found on the page.
- Sound or desktop notifications when new content appears.

---

## Platform

- Chrome Extension, Manifest Version 3
- Minimum Chrome version: 120
- No build step — plain JavaScript files loaded directly by Chrome
- No external dependencies

---

## Data Model

A **rule** is the core entity. All rules are stored as a JSON array in `chrome.storage.local` under the key `rules`.

| Field | Type | Required | Default | Constraints |
|---|---|---|---|---|
| `id` | string (UUID) | Yes | auto-generated | Must be non-empty to persist |
| `name` | string | No | `""` | Display label only |
| `urlPattern` | string | Yes | — | Non-empty; case-insensitive substring matched against tab URLs |
| `selector` | string | Yes | — | Non-empty CSS selector or XPath expression |
| `targetUrl` | string | No | `""` | Full URL to open if no matching tab exists |
| `intervalMs` | number | Yes | `10000` | Minimum `500`; legacy `intervalMinutes` field is migrated on read |
| `activateTab` | boolean | Yes | `false` | Whether to bring the tab to the front before each click |
| `enabled` | boolean | Yes | `true` | Disabled rules are stored but do not click or reopen tabs |

A rule with an empty `urlPattern` or empty `selector` is considered invalid and is silently dropped on read.

### Temporary storage keys

| Key | Purpose | Lifetime |
|---|---|---|
| `lastPickedElement` | Result written by the element picker in the page | Consumed once when the popup opens |
| `draftRule` | Form state saved before the picker closes the popup | Consumed once when the popup reopens |

---

## Features

### 1. Auto-clicking

**As a user**, I want the extension to click a button on a matching page automatically at a set interval, so I don't have to keep the page focused or manually refresh it.

#### Acceptance criteria

- The content script runs on every page, including subframes (`all_frames: true`), at `document_idle`.
- On load and on any URL change (hash change, popstate, `history.pushState`, `history.replaceState`), the content script reads all rules from storage and sets up an interval timer for each rule that matches the current URL.
- A rule matches the current URL if the rule's `urlPattern` is a case-insensitive substring of the current `location.href`.
- Only enabled rules produce timers.
- If the set of matching rules changes (rules updated in storage), old timers are cancelled and new ones are started.
- The content script guards against running twice on the same page with a `__autoClickerLoaded` flag on `globalThis`.
- When a timer fires, the click is skipped if `document.visibilityState !== "visible"`.
- When `activateTab` is `true`, the extension asks the background to bring the tab to the front before clicking, waits 120 ms, then clicks. If activation fails, the click is skipped for that tick.
- Re-initialisation also occurs when the page becomes visible (`visibilitychange` event).

#### Element clicking

- If the selector starts with `/`, `(`, or `./`, it is treated as XPath; otherwise as CSS.
- **CSS**: The selector is tried against `document` using `querySelector`. If not found, the search recursively enters shadow roots (BFS). The first matching element wins.
- **XPath**: `document.evaluate` with `FIRST_ORDERED_NODE_TYPE` is used. Shadow DOM is not traversed for XPath.
- The found element is scrolled into view (`block: center`, `inline: center`, `behavior: instant`), focused, then receives a full synthetic pointer and mouse event sequence in order: `pointerover`, `mouseover`, `pointerdown`, `mousedown`, `pointerup`, `mouseup`, `click`. The element's `.click()` method is also called. All events bubble and are composed.

---

### 2. Tab reopening

**As a user**, I want the extension to reopen a page automatically if its tab is closed, so I never lose the monitored page.

#### Acceptance criteria

- The background service worker checks all enabled rules with a non-empty `targetUrl` on: extension startup, extension install, any change to the `rules` storage key, and any tab removal.
- For each such rule, the background queries all open tabs. If no open tab has a URL that matches the rule's `urlPattern` (case-insensitive substring), the background opens `targetUrl` in a new active tab.
- Multiple rules can trigger independent tab opens in a single check. Each opened tab is considered "open" for subsequent rules in the same check to avoid opening the same URL twice if two rules share a pattern.

---

### 3. Popup UI

**As a user**, I want a popup where I can create, edit, and delete rules, so I can manage automation without leaving the browser.

#### Layout

The popup is a single vertical page (min-width 400 px) with three areas:

1. **Header** — extension name, current tab URL, and a "Use this site" shortcut.
2. **Rule form section** — fields to create or edit a rule.
3. **Rules list section** — cards for all saved rules.

#### Header

- Displays the truncated URL of the currently active tab.
- If no active tab URL is detected: `"Detecting tab…"`.
- "Use this site" button fills the URL pattern field with the origin of the active tab's URL (scheme + host + port) and sets the hidden `targetUrl` field to the full tab URL.

#### Rule form

Fields:
- **Rule name** — optional text, placeholder `"Free slots refresh"`.
- **URL contains** — required text; on init, pre-filled with the active tab's origin.
- **Button selector** — required text, accepts CSS or XPath.
- **Interval in milliseconds** — number, min `500`, step `100`, default `10000`.
- **Activate this tab** — checkbox, default unchecked.
- **Enable this rule** — checkbox, default checked.

Hidden fields: `rule-id` (UUID of the rule being edited, empty for new), `target-url` (full URL for tab reopening).

Actions:
- **Save rule** — validates that URL pattern and selector are non-empty; creates a new rule or updates the existing one (matched by `rule-id`); persists to storage; clears form.
- **Clear form** — resets all fields to defaults; removes any saved draft from storage.
- **Pick from page** — saves current form state as a draft to storage, sends a `start-picker` message to the active tab's content script, then closes the popup.

Status area: a line below the form showing success (green) or error (red) messages.

#### Rules list

- Shows an empty-state message when no rules exist.
- Each rule renders a card with:
  - Rule name (fallback: `"Unnamed rule"`).
  - `"URL contains: <urlPattern>"`.
  - `"Selector: <selector>"`.
  - `"Every <formatted interval>"` — formatted as ms, seconds, or minutes (trimmed decimals).
  - Enabled/Disabled badge.
  - Selector kind chip: `"CSS"` or `"XPath"`.
  - Behavior chip: `"Reopens closed tab"` if `targetUrl` is set; `"Activates before click"` if `activateTab`; otherwise `"Runs silently"`.
  - **Edit** — loads the rule into the form.
  - **Delete** — removes the rule from storage immediately.

---

### 4. Element picker

**As a user**, I want to click on a button in the page to have its selector filled in automatically, so I don't have to write CSS or XPath by hand.

#### Acceptance criteria

- Activating the picker closes the popup and saves form state as a draft.
- The content script overlays the page with a semi-transparent highlight that follows the pointer, showing the currently hovered target.
- A fixed hint banner reads: `"Vuoropäivittäjä: click the target element, or press Escape to cancel"`.
- Only button-like elements are selectable: `button`, `input[type="button"]`, `input[type="submit"]`, `input[type="reset"]`, `[role="button"]`. The picker walks up the composed event path to find the nearest such ancestor.
- Clicking a target:
  1. Prevents default and stops propagation.
  2. Builds a selector for the element (see Selector building below).
  3. Saves `{ selector, url: location.href, timestamp }` to `chrome.storage.local` under `lastPickedElement`.
  4. Exits picker mode.
- Pressing `Escape` exits picker mode without saving.
- Picker overlay elements carry `data-auto-clicker-overlay="true"` and are excluded from selection.

#### Selector building

The picker generates the most stable, unique selector for the picked element using this priority order:

1. **Indexed XPath for duplicates** — for each preferred attribute with a value, builds `//<tag>[@attr=<value>]` and evaluates how many nodes it matches. If there are multiple matches, returns `(<xpath>)[n]` where `n` is the 1-based index. Also tries the first stable class name with `contains(@class)`. Returns this only if the result starts with `(` (i.e., it was indexed).

2. **CSS candidates** — builds candidates in this order and returns the first that uniquely matches the element on the page:
   - `#<id>` (only if the ID is stable)
   - `<tag>[<preferred-attr>="<value>"]` for each preferred attribute with a value
   - `<tag>.<firstStableClass>`
   - `<tag>.<allStableClasses joined by .>`
   - `<tag>`
   - Each of the above prefixed with up to 3 ancestor selectors (walking up the DOM)
   - DOM path candidates (full path from element to root, progressively shorter)

3. **XPath fallback** — same preferred-attribute and stable-class logic as step 1, but returns a non-indexed XPath (or `(xpath)[n]`). If none found, falls back to an absolute XPath built by walking the full DOM path with sibling indices.

**Preferred attributes** (checked in order): `data-testid`, `data-test`, `data-automation-id`, `aria-label`, `name`, `title`, `type`, `role`.

**Stable class names**: class tokens that are 2–31 characters, match `/^[a-z][a-z0-9_-]{1,30}$/i`, and do not contain 3+ consecutive digits, do not match `/^f[a-z0-9]+$/i`, do not start with `__`, and do not contain `buttoncanvas` (case-insensitive).

**Stable IDs**: same rules as stable class names (no whitespace, no 3+ consecutive digits, not `/^f[a-z0-9]+$/i`, not starting with `__`, not containing `buttoncanvas`).

#### Picker state restoration

When the popup opens after a pick:
1. The draft rule (saved before picker opened) is loaded and fills the form.
2. The `lastPickedElement` value is read: its `selector` fills the selector field; its `url` sets `targetUrl` and fills `urlPattern` with the URL's origin.
3. Both storage keys are cleared.
4. A status message confirms the pick.

---

## Non-functional requirements

- **No build step** — all JS files are plain ES2020+ scripts with no module bundler. `shared.js` exports its API to `globalThis.AutoClickerShared` and also supports `module.exports` for Node.js test execution.
- **Tests** — shared utility functions (`clampIntervalMs`, `urlMatches`, `looksLikeXPath`, `isStableIdentifier`, `normalizeRule`, `normalizeRules`) are covered by unit tests runnable with `node --test` (no test framework dependency).
- **Interval clamping** — any interval below 500 ms is silently clamped to 500 ms. A legacy `intervalMinutes` field (number of minutes) is supported on read and converted to milliseconds.
- **Shadow DOM** — CSS selector matching traverses shadow roots breadth-first. XPath does not.
- **SPA support** — the content script patches `history.pushState` and `history.replaceState` and listens to `hashchange` and `popstate` to detect URL changes and re-initialise timers.
- **Idempotent loading** — the content script uses a `__autoClickerLoaded` guard so injecting it twice has no effect.
- **Popup draft persistence** — form state is not lost when the user navigates away to use the picker. The draft is saved to storage before the popup closes and restored when it reopens.
