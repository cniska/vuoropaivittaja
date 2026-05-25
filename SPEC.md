# Vuoropäivittäjä specification

## Overview

Vuoropäivittäjä is a Chrome Manifest V3 slot-reserving helper. It watches one page, clicks a configured refresh control on a schedule, compares the visible slot list before and after the click, and alerts the user when the list changes.

## Product contract

- One monitored site at a time.
- The active tab origin is the source of truth. The user does not type a URL.
- The system detects slot-list changes, not semantic appointment verification.
- New slots are expected to appear first, in descending time order.
- Monitoring can continue while the tab is in the background.
- Closing the last matching monitored tab disables monitoring automatically.
- All user-facing UI text must be Finnish.
- Code, developer logs, and internal identifiers should be English.

## Scope

In scope:

- A compact popup for settings, selection, and testing.
- Autosave for all editable settings.
- Element picker support for refresh buttons inside frames.
- Desktop notification and sound alerts.
- A local test page that behaves like a real slot list.
- Debug logging for development and support.

Out of scope:

- Multiple monitored sites.
- Manual URL entry.
- Semantic parsing of appointments beyond visible list changes.
- Build steps or bundled runtime dependencies.

## Technical requirements

- Chrome MV3.
- Minimum Chrome version: 120.
- Plain ES2020+ JavaScript loaded directly by Chrome.
- No build pipeline.
- No external runtime dependencies.
- Use standard Chrome extension capabilities for notifications, storage, tabs, scripting, and offscreen audio.
- Automated tests should run through `pnpm test`.

The implementation should keep browser-specific logic thin and isolate pure logic so it can be unit-tested.

## Persistent state

Store persistent state in `chrome.storage.local`.

### Settings

- `enabled`: Master monitoring toggle.
- `notifications`: Desktop notification toggle.
- `sound`: Audible alert toggle.
- `debugLogging`: Development logging toggle.
- `minIntervalMs`: Minimum wait between refresh clicks.
- `maxIntervalMs`: Maximum wait between refresh clicks.

### Rule

- `urlPattern`: Derived from the active tab origin.
- `selector`: Refresh button selector chosen by the user or picker.
- `listSelector`: Automatically detected slot list container when available.

The active rule is only valid when both `urlPattern` and `selector` are present.

### Slot history

- `slotHistory`: Object keyed by URL origin (e.g. `"https://example.com"`), each value an array of slot entries capped at 500 items.

Each entry contains:

- `text`: The visible slot line text as parsed from the slot list. Full Finnish weekday names are stored (e.g. "Lauantai"); abbreviation to 2 letters (e.g. "La") is applied at display time only.
- `firstSeen`: ISO timestamp of when the slot was first observed.
- `lastSeen`: ISO timestamp of when the slot was most recently observed.

Entries are de-duplicated by `text`. When a known slot text reappears, only `lastSeen` is updated; no duplicate entry is added. When the cap is exceeded, the oldest entries by `firstSeen` are dropped first.

Legacy flat-array values are silently discarded and replaced with an empty map.

## Popup requirements

The popup should be modern, clean, minimal, compact, and accessible.

- Settings are shown in Finnish.
- Changes autosave immediately.
- Successful saves show a short toast.
- Failures triggered by explicit user actions also show a Finnish toast.
- The popup shows the active tab origin.
- The user can start the element picker from the popup.
- The user can test the configured selector from the popup.
- The popup should restore the last picked selector when available.

### Two-column layout

The popup is divided into two columns:

- **Left column**: all existing controls (origin display, settings, picker, test button).
- **Right column**: slot history list.

Both columns are visible simultaneously. The popup width should expand to accommodate both columns comfortably.

### Slot history column

- Shows all recorded slot entries for the current domain, sorted date ascending; ties broken by `lastSeen` ascending.
- Weekday names are abbreviated to 2 letters at display time (e.g. "Lauantai" → "La").
- Each row shows the slot text and the `lastSeen` timestamp formatted in Finnish locale.
- A `firstSeen` timestamp is shown when it differs from `lastSeen` (i.e. the slot has been seen across multiple cycles).
- The list is paginated; each page shows 10 entries.
- Pagination controls appear below the list when there is more than one page.
- A "Tyhjennä historia" (clear history) button appears above the list; clicking it clears only the current domain's entries after confirmation.
- The column is accessible with keyboard: pagination and the clear button are focusable and operable without a mouse.

## Monitoring requirements

- Monitoring starts only when monitoring is enabled, a valid rule exists, and the active top-level tab URL matches the stored origin pattern.
- The content script must work in pages that use frames.
- The refresh control can live inside a frame, and the chosen selector must still work when tested later.
- The monitored snapshot should prefer the visible slot list when it exists, and fall back to page text when it does not.
- The comparison should be based on the visible content before and after the refresh click.
- When the snapshot changes, the extension sends an alert request to the background worker.
- When the snapshot changes, the content script parses the current slot list into individual lines and includes them in the alert message so the background worker can update the slot history.
- A failed monitor cycle must not crash the content script or block later cycles.

## Picker requirements

- The picker shows an overlay on the page and a short Finnish hint.
- Esc cancels the picker.
- Clicking the refresh control selects it.
- The picker should prefer stable selectors.
- Avoid double-activating the target element. One synthetic activation sequence is enough.
- The picker must support refresh buttons inside frames.

## Background requirements

- Background code receives change alerts and handles notification, sound, and slot history updates.
- Notification and sound handling are independent. One failing channel must not block the other.
- If notifications are enabled, the user gets a Chrome desktop notification.
- If sound is enabled, the user gets a short alert beep through an offscreen document.
- When an alert includes slot lines, the background worker merges them into `slotHistory` in `chrome.storage.local`, applying de-duplication and the 500-entry cap.
- When the last matching tab closes, monitoring is disabled automatically.

## Offscreen audio requirements

- Use an offscreen document for alert sound.
- Reuse the offscreen document when it already exists.
- Avoid duplicate document creation.
- The sound should be short and unobtrusive.

## Logging requirements

- User-facing UI text is Finnish.
- Developer-facing logs are English.
- When debug logging is enabled, logs should be readable in DevTools and should not dump raw JSON noise as the primary format.
- Use logs to describe invisible actions such as autosave, picker activity, monitoring start, and alert dispatch.
- Keep logs useful without being noisy.

## Accessibility requirements

- The popup must be usable with keyboard only.
- Form controls need accessible labels.
- Status updates and toasts must be announced politely.
- Decorative controls should not clutter the accessibility tree.

## Test page requirements

- Include a local test page that can be served locally through a project script.
- The test page should resemble a real slot list, not a toy demo.
- It should have one refresh control and one visible slot list.
- Slot items should show full Finnish weekday name, date, shift, and an optional `Uusi` badge.
- New slots should be queued in the background and appear only when refresh is clicked.
- Some refresh cycles should intentionally make no visible change so no-change behavior can be verified.
- New slots should appear first in the list.

## Testability requirements

- Unit tests should cover settings normalization, rule normalization, URL matching, alert message construction, snapshot comparison, slot history merging (de-duplication, cap enforcement, oldest-first eviction), and the main monitoring decision logic.
- Pure helper logic should be extracted where needed so it can be tested without a browser.
- Browser-specific behavior should be kept behind thin seams.

## Failure handling

- Popup-visible errors must be Finnish.
- Autosave failures may remain silent unless the user explicitly triggered the action.
- Picker startup and test failures must show a toast.
- Background alert failures must not block the other alert channel.
- Content scripts must tolerate inaccessible pages, reloaded tabs, and stale frame contexts.
- Slot history write failures must not block notification or sound delivery.

## Verification

Automated checks:

- `pnpm test`
- `pnpm check`
- `pnpm lint` when lint-only verification is needed

Manual verification:

- Load the unpacked extension after manifest changes.
- Open the local test page and confirm picker, test click, monitoring, notification, and sound.
- On the real PowerApps page, confirm the picker selects the refresh button, `Testaa` clicks the same control, and no unintended `/open/...` navigation appears.
- Confirm closing the last monitored tab disables monitoring.
