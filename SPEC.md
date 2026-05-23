# Vuoropäivittäjä rebuild specification

## Purpose

Vuoropäivittäjä is a Chrome Manifest V3 extension that monitors one booking or scheduling page for changed availability. It periodically clicks a configured refresh button, compares page snapshots before and after the click, and alerts the user when the snapshot changes.

This document is the rebuild contract. A coding agent should be able to recreate the product from this file without reading the existing implementation.

## Product contract

- The extension supports one monitored site and one refresh button at a time.
- The monitored site is always derived from the active browser tab origin. The user never enters a URL manually.
- The extension detects page changes, not semantically verified new appointments. A changed slot list means "new slots may be available."
- The monitored slot list is expected to be sorted by time in descending order, with newly added slots appearing first.
- Monitoring can run while the tab is in the background.
- Closing the last matching monitored tab disables monitoring automatically.
- All user-facing text must be Finnish.

## Out of scope

- Multiple monitored sites.
- Slot history or storage of found slots.
- Semantic parsing of appointments.
- Manual URL input.
- A dedicated "test sound" or "test notification" button.
- A build pipeline or bundled dependencies.

## Platform and files

- Chrome Extension Manifest V3.
- Minimum Chrome version: 120.
- Plain ES2020+ JavaScript loaded directly by Chrome.
- No external runtime dependencies.
- Tests use Node's built-in test runner and run with `pnpm test`.

Required files:

- `manifest.json`
- `background.js`
- `content.js`
- `content-helpers.js`
- `popup.html`
- `popup.css`
- `popup.js`
- `shared.js`
- `offscreen.html`
- `offscreen.js`
- `shared.test.js`
- `icon.png`

`shared.js` must export the same API to both `globalThis.VuoropaivittajaShared` and `module.exports`.

## Manifest contract

The manifest must include:

- `manifest_version: 3`
- Name: `Vuoropäivittäjä`
- Default popup: `popup.html`
- Default title: `Vuoropäivittäjä`
- Default icon: `icon.png`
- Background service worker: `background.js`
- Content scripts: `shared.js`, `content-helpers.js`, and `content.js`
- Content script matches: `<all_urls>`
- Content script options: `all_frames: true`, `run_at: "document_idle"`
- Permissions: `notifications`, `offscreen`, `scripting`, `storage`, `tabs`
- Host permissions: `<all_urls>`

## Storage model

All persistent state lives in `chrome.storage.local`.

### `settings`

| Field | Type | Default | Rules |
|---|---|---|---|
| `enabled` | boolean | `false` | Master monitoring toggle |
| `notifications` | boolean | `true` | Desktop notification toggle |
| `sound` | boolean | `true` | Audible alert toggle |
| `debugLogging` | boolean | `false` | `Vianhaku`; enables structured console logging in popup, content script, and background when active |
| `minIntervalMs` | number | `30000` | Minimum `2000` |
| `maxIntervalMs` | number | `90000` | Must be at least `minIntervalMs` |

### `rule`

| Field | Type | Default | Rules |
|---|---|---|---|
| `urlPattern` | string | `""` | Active tab origin, matched case-insensitively against the top-level tab URL |
| `selector` | string | `""` | CSS selector or XPath for the refresh button |
| `listSelector` | string | `""` | Auto-detected selector for the list/grid container; hidden from UI |

A rule is inactive if `urlPattern` or `selector` is empty.

### Temporary keys

| Key | Shape | Lifetime |
|---|---|---|
| `draftRule` | `{ selector }` | Saved before picker closes popup; consumed once when popup opens |
| `lastPickedElement` | `{ selector, url, frameId, tabId, timestamp }` | Written after picker selection; consumed once when popup opens |

## Shared utilities

Implement shared pure functions for code reuse and tests:

- `normalizeSettings(value)`: Returns defaults, coerces booleans, clamps intervals.
- `normalizeRule(value)`: Returns `null` for invalid input; trims `urlPattern`, `selector`, and `listSelector`.
- `urlMatches(pattern, url)`: Case-insensitive substring match.
- `shouldMonitorTab(settings, rule, tabUrl)`: True only when settings are enabled, rule is valid, and the top-level tab URL matches.
- `buildChangeAlertMessage(settings)`: Returns `{ type: "change-detected", notifications, sound, debugLogging }` using normalized settings.
- `looksLikeXPath(selector)`: True when trimmed selector starts with `/`, `(`, or `./`.
- `isStableIdentifier(value)`: Reject empty values, whitespace, 3+ consecutive digits, `/^f[a-z0-9]+$/i`, `__` prefix, and values containing `buttoncanvas`.

## Popup behavior

The popup is a compact settings panel with two sections and an autosave notice.

### Layout mockup

```text
+--------------------------------------+
| Vuoropäivittäjä                      |
+--------------------------------------+
| ASETUKSET                            |
|                                      |
| Tarkkailu päällä                 [ ] |
| Työpöytäilmoitus                 [ ] |
| Äänimerkki                       [ ] |
|                                      |
| Päivitysväli (s)                     |
| +------------+  +------------+       |
| | Min     30 |  | Max     90 |       |
| +------------+  +------------+       |
+--------------------------------------+
| KOHDE                                |
|                                      |
| Seurattava sivu                      |
| +----------------------------------+ |
| | https://apps.powerapps.com       | |
| +----------------------------------+ |
|                                      |
| Painikkeen valitsin                  |
| +----------------------------------+ |
| | button[aria-label="..."]         | |
| +----------------------------------+ |
|                                      |
| [ Valitse sivulta ] [ Testaa ]       |
+--------------------------------------+
| Muutokset tallentuvat automaattisesti|
+--------------------------------------+
| Toasti nousee alareunan päälle       |
+--------------------------------------+
```

### Controls

- Toggle: `Tarkkailu päällä` -> `settings.enabled`
- Toggle: `Työpöytäilmoitus` -> `settings.notifications`
- Toggle: `Äänimerkki` -> `settings.sound`
- Toggle: `Vianhaku` -> `settings.debugLogging`
- Number input: `Min` under `Päivitysväli (s)` -> `settings.minIntervalMs / 1000`
- Number input: `Max` under `Päivitysväli (s)` -> `settings.maxIntervalMs / 1000`
- Read-only value: `Seurattava sivu` -> active tab origin or `Ei asetettu`
- Text input: `Painikkeen valitsin` -> `rule.selector`
- Button: `Valitse sivulta`
- Button: `Testaa`
- Footer text: `Muutokset tallentuvat automaattisesti`
- Toast status area for success and error messages.

### Autosave

- On popup open, read the active tab and stored state.
- Toggles save `settings` on `change`.
- Interval inputs save `settings` on `change`; clamp min to 2 seconds and max to at least min.
- The `Vianhaku` toggle saves `settings.debugLogging` on `change` and shows `Tallennettu.` on success.
- Selector saves `rule` on `change`; `urlPattern` must be derived from the active tab origin at save time and `listSelector` must reset to `""`.
- Successful autosaves show `Tallennettu.` in the toast.
- Manually editing selector clears any stored picked `frameId` hint.
- Loading `lastPickedElement` must fill the selector, remember `frameId` only when `tabId` matches the active tab, autosave the rule, clear the temporary key, and show `Painike valittu sivulta.`
- When the monitoring loop clicks the refresh button and the popup is open, reuse the same toast area to show `Päivitä-painiketta klikattiin.` or the click failure message.

### Picker button

- If no active tab is available, show `Avaa kohdesivusto ensin.`
- Otherwise save `draftRule`, send `{ type: "start-picker" }` to the active tab, and close the popup.
- If the content script is not present, inject `content-helpers.js` and `content.js` into all frames and retry.
- On failure, show `Valitsin ei käynnistynyt. Lataa sivu uudelleen ja yritä uudelleen.`

### Test button

- If no active tab is available, show `Avaa kohdesivusto ensin.`
- If selector is empty, show `Syötä valitsin ensin.`
- Otherwise send `{ type: "test-rule", rule: { urlPattern, selector } }` to the active tab.
- If a picked frame hint exists, send the message to that `frameId`.
- Show the response message on success or the response error on failure.
- If no content script responds, inject `shared.js`, `content-helpers.js`, and `content.js` into all frames and retry.
- If the page still cannot be reached, show `Sivuun ei saatu yhteyttä. Lataa sivu uudelleen ja yritä.`

### Debug logging

- When `settings.debugLogging` is true, the extension emits badge-styled console logs for user-visible actions and invisible operational steps from the popup, content script, and background service worker.
- Each log entry should start with a blue `Vuoropäivittäjä` badge, followed by a short English headline and a compact inline metadata trail.
- Use `console.info` for ordinary action logs, `console.warn` for recoverable problems, and `console.error` for failures.
- Content-script startup and picker lifecycle logs are emitted from the top frame only; frame-local monitoring logs remain frame-local.
- Popup logs are visible in the popup DevTools console.
- Content-script logs are visible in the monitored page console.
- Background logs are visible in the service worker console from `chrome://extensions`.

### Accessibility

- Popup language is Finnish (`lang="fi"`).
- The app name is an `h1`.
- Sections have accessible headings.
- Decorative toggle tracks are `aria-hidden`.
- The interval inputs are grouped and labelled.
- Each number input has an accessible name.
- The current page display uses polite live updates.
- Toast uses `role="status"`, `aria-live="polite"`, and `aria-atomic="true"`.

## Content script behavior

The content script runs in every frame and must guard against duplicate initialization with `globalThis.__vuoropaivittajaLoaded`.

### Message handling

- `{ type: "start-picker" }`: Start element picker and respond with success.
- `{ type: "test-rule", rule }`: Validate non-empty selector, click it in the current frame, and respond with success or a Finnish error.

Do not enforce URL matching inside `test-rule`; popup intent and frame targeting are sufficient. This avoids false failures in embedded PowerApps frames whose frame URL differs from the browser tab URL.

### Monitoring startup

On initialization and whenever `settings` or `rule` changes:

- Normalize stored state.
- Increment a monitoring session counter so old loops cancel at their next checkpoint.
- Start monitoring in a frame only when:
  - `settings.enabled` is true.
  - `rule` is valid.
  - The top-level tab URL matches `rule.urlPattern`. Ask the background service worker with `{ type: "should-monitor-tab", settings, rule }`; fall back to the frame URL check only if messaging fails.
  - The current frame contains the configured selector.

This frame-aware behavior is required for PowerApps pages where the browser address bar is on `apps.powerapps.com` but the actual canvas content runs in a different frame.

### Monitoring loop

For each monitoring session:

1. Wait a random interval in `[minIntervalMs, maxIntervalMs]`.
2. Take a snapshot.
3. Click the configured selector.
4. Wait 1500 ms for the page to settle.
5. Take a second snapshot.
6. If snapshots differ by `JSON.stringify`, send `buildChangeAlertMessage(settings)` to the background service worker.
7. Continue until the session is cancelled.

### Snapshot logic

- If `rule.listSelector` matches an element and it contains `[role="listitem"]` children, snapshot each list item `innerText` as an ordered array.
- Otherwise snapshot `document.body.innerText` as a single-element array.
- `listSelector` is auto-detected when empty by resolving the button, walking ancestors, finding a descendant `[role="list"]` or `[role="grid"]` not inside the button, and building a selector for that container.
- The test page and the production page both rely on descending slot order so that newly added slots appear at the top of the list.

### Element lookup

- XPath selectors are detected with `looksLikeXPath`.
- XPath lookup uses `document.evaluate(..., XPathResult.FIRST_ORDERED_NODE_TYPE, ...)`.
- CSS lookup uses `querySelector` on `document`, then breadth-first traversal into open shadow roots.

### Click activation

When a selector resolves:

- Scroll the element into view with centered block and inline alignment.
- Focus it with `preventScroll: true` when focus is available.
- Dispatch one synthetic pointer/mouse activation sequence to the element:
  - `pointerover`
  - `mouseover`
  - `pointerdown`
  - `mousedown`
  - `pointerup`
  - `mouseup`
  - `click`
- Do not also call `element.click()`. PowerApps can treat duplicate activation as an unintended navigation.

### SPA support

Reinitialize when:

- `hashchange` fires.
- `popstate` fires.
- Patched `history.pushState` changes the URL.
- Patched `history.replaceState` changes the URL.
- `visibilitychange` makes the document visible.

## Element picker

The picker lets the user click the refresh button instead of writing a selector.

### Interaction

- Starting the picker removes any existing picker first.
- Add a fixed highlight overlay that follows selectable button-like elements.
- Add a fixed hint banner with Finnish text instructing the user to click a button or press Esc.
- Selectable elements are:
  - `button`
  - `input[type="button"]`
  - `input[type="submit"]`
  - `input[type="reset"]`
  - `[role="button"]`
- On `pointerdown` over a selectable element, stop propagation but do not call `preventDefault`; Chrome may suppress the later `click`.
- On `click`, prevent default, stop propagation, build a selector, send `{ type: "element-picked", selector }` to the background, and stop the picker.
- On `Escape`, cancel and stop the picker without saving.

### Selector priority

Build selectors in this order:

1. Unique CSS candidate:
   - `#id` when stable.
   - `tag[attr="value"]` for preferred attributes.
   - `tag.class` using stable classes.
   - Ancestor-qualified direct selectors.
   - DOM path with `:nth-of-type` where needed.
2. Indexed XPath `(<xpath>)[n]` using preferred attributes or a stable class when duplicates exist.
3. XPath fallback using attributes/classes or an absolute path.

Preferred attributes:

- `data-testid`
- `data-test`
- `data-automation-id`
- `data-control-name`
- `aria-label`
- `name`
- `title`
- `type`
- `role`

Stable class and identifier filtering must use `isStableIdentifier` rules plus class-name shape validation.

## Background service worker behavior

### Messages

- `{ type: "change-detected", notifications, sound, debugLogging }`
  - If `notifications` is true, create a Chrome desktop notification with title `Vuoropäivittäjä` and message `Uusia vuoroja saattaa olla saatavilla.`
  - If `sound` is true, play alert sound through the offscreen document.
  - Notification and sound attempts must be independent; one failure must not block the other.
- `{ type: "element-picked", selector }`
  - Store `lastPickedElement` with selector, `sender.url`, `sender.frameId`, `sender.tab.id`, and timestamp.
- `{ type: "should-monitor-tab", settings, rule }`
  - Respond with `{ ok: true, shouldMonitor }` using the sender's top-level `tab.url`.

### Popup restoration after picker

When `lastPickedElement` is written, call `chrome.action.openPopup()` if available. Failure must be ignored so older Chrome versions degrade to manual toolbar click.

### Disable on tab close

On any tab removal:

- Read normalized `settings` and `rule`.
- If monitoring is disabled or no rule is active, do nothing.
- Query all open tabs.
- If no open tab URL matches `rule.urlPattern`, set `settings.enabled` to `false` while preserving other settings.

## Offscreen audio behavior

The background worker cannot rely on page content for product audio. Use an extension offscreen document.

- Manifest must include the `offscreen` permission.
- `background.js` creates `offscreen.html` with reason `AUDIO_PLAYBACK` before playing sound.
- Reuse an existing offscreen document when one exists.
- Avoid concurrent duplicate creation with an in-flight creation promise.
- `offscreen.js` listens for `{ type: "play-alert-sound" }`.
- Sound is generated with Web Audio API oscillator and gain envelope.
- Use a short beep: start around 880 Hz, shift to 660 Hz after 0.15 s, fade out by about 0.45 s.
- No audio file dependency.

## Failure handling

- All popup-visible errors must be Finnish.
- Autosave failures may be silent unless they affect an explicit user action.
- Picker startup and test failures must show a toast.
- Alert creation failures should not show UI because they happen during background monitoring; they must not block the other alert channel.
- Content scripts must tolerate inaccessible pages and frames.
- A stale picked `frameId` must not be reused after manual selector edits.

## Test page

Include a local test page that simulates a PowerApps-like DOM:

- Refresh control: `[role="button"][data-control-name="refresh_button"]`
- Slot list: `[role="list"][data-testid="vuoro-lista"]`
- Slot entries: `[role="listitem"]`
- Slot entries on the test page show the slot time and an optional `Uusi` badge, without extra location text.
- New slots are queued periodically; some ticks intentionally do nothing so refresh can also be tested against a no-change case.
- New queued slots are inserted into the visible list only when refresh is clicked.

Provide a `pnpm serve` script that serves the test page on port 3000.

## Verification

Automated checks:

- `pnpm test`
- `pnpm check`
- `pnpm lint` when lint-only verification is desired.

Unit tests should cover at minimum:

- Settings normalization defaults and interval clamping.
- Rule normalization and invalid rule rejection.
- Case-insensitive URL matching.
- Top-level tab monitoring decision.
- Alert message construction preserving independent notification and sound toggles.
- XPath detection.
- Stable identifier rejection for dynamic PowerApps-like IDs.

Manual verification:

- Load the unpacked extension in Chrome after manifest permission changes.
- Open the local test page and confirm picker, test click, monitoring, desktop notification, and sound.
- On a PowerApps booking page, pick the refresh button, confirm `Testaa` clicks the same frame/button, and confirm no unexpected `/open/...` tab is created by repeated tests.
- Confirm closing the last monitored tab turns `Tarkkailu päällä` off.

## Commit and tooling rules

- Use `pnpm` scripts: `pnpm test`, `pnpm lint`, `pnpm check`, `pnpm format`.
- Commit only when explicitly requested.
- Commit messages use Conventional Commits: `feat`, `fix`, `refactor`, `docs`, or `chore`.
- Keep commit subjects under 72 characters.
