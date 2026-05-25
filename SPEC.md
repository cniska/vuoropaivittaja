# Vuoropäivittäjä specification

## Overview

Vuoropäivittäjä is a Chrome Manifest V3 slot-reserving helper. It watches one page, clicks a configured refresh control on a schedule, compares the visible slot list before and after the click, and alerts the user when new slot lines appear.

## Product contract

- One monitored site at a time.
- The active tab origin is the source of truth. The user does not type a URL.
- The system detects newly available slot lines, not semantic appointment verification.
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
- `removedAt`: ISO timestamp set when the slot disappears from a non-empty snapshot. This only means the slot is no longer visible; the reason is unknown. Cleared if the slot reappears.

Entries are de-duplicated by `text`. When a known slot text reappears, `lastSeen` is updated and `removedAt` is cleared. When the cap is exceeded, the oldest entries by `firstSeen` are dropped first.

Legacy flat-array values are silently discarded and replaced with an empty map.

## Popup requirements

The popup should be modern, clean, minimal, compact, and accessible.

- Settings are shown in Finnish.
- Changes autosave immediately.
- Successful saves show a short toast.
- Failures triggered by explicit user actions also show a Finnish toast.
- The popup does not display the active tab origin or URL explicitly.
- The user can start the element picker from the popup.
- The user can test the configured selector from the popup.
- The popup should restore the last picked selector when available.
- When monitoring is enabled, all configuration inputs (interval, selector, picker, test) are disabled. Notification and sound toggles remain editable at all times.

### Two-column layout

The popup is divided into two columns:

- **Left column**: settings, picker, and test control.
- **Right column**: slot history list.

Both columns are visible simultaneously. The popup width should expand to accommodate both columns comfortably.

### Slot history column

- Shows all recorded slot entries for the current domain.
- Active slots (no `removedAt`) are sorted before removed slots; within each group, sorted date ascending; ties broken by `lastSeen` ascending.
- Weekday names are abbreviated to 2 letters at display time (e.g. "Lauantai" → "La").
- Each row shows the slot text, a first-seen timestamp, and either a last-seen timestamp or a removed-at timestamp, all formatted in Finnish locale.
- Removed slots (with `removedAt`) are rendered at reduced opacity.
- Removed slots show a hover-revealed delete button (×) to remove that individual entry from the domain's history.
- The first 20 entries are shown initially; a load-more button shows 20 more at a time without resetting position on live updates.
- A clear button appears above the list; clicking it clears only the current domain's entries after confirmation.
- The column is accessible with keyboard: load-more, clear, and delete buttons are focusable and operable without a mouse.

## Monitoring requirements

- Monitoring starts only when monitoring is enabled, a valid rule exists, and the active top-level tab URL matches the stored origin pattern.
- The content script must work in pages that use frames.
- The refresh control can live inside a frame, and the chosen selector must still work when tested later.
- The monitored snapshot should prefer the visible slot list when it exists, and fall back to page text when it does not.
- The comparison should be based on the visible content before and after the refresh click.
- When the refreshed snapshot contains new slot lines, the extension sends an alert request to the background worker.
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
- Debug logging is toggled via the developer console: `VuoropaivittajaShared.toggleDebug()`. There is no UI toggle.

## Accessibility requirements

- The popup must be usable with keyboard only.
- Form controls need accessible labels.
- Status updates and toasts must be announced politely.
- Decorative controls should not clutter the accessibility tree.

## Test page requirements

- Include a local test page that can be served locally through a project script.
- The test page should resemble a real slot list, not a toy demo.
- It should have one refresh control and a three-tab layout: new, accepted, and rejected slots.
- The new tab is the monitored list. Accepted and rejected tabs are only for explicit row actions.
- Rows in the new tab expose accept and reject buttons for manual verification.
- Slots removed by the system disappear from the new list and are not moved into accepted or rejected history.
- Slot items show full Finnish weekday name, date, and shift. No badge is used.
- New slots are queued in the background and appear only when refresh is clicked.
- Adding slots flashes the row green briefly; system-removed rows fade out in red before disappearing.
- Some refresh cycles intentionally make no visible change so no-change behavior can be verified.
- New slots appear first in the list.
- A stat footer shows visible count, queued count, total added, accepted count, rejected count, total removed, and total click count.

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
- On the real PowerApps page, confirm the picker selects the refresh button, the test control clicks the same control, and no unintended `/open/...` navigation appears.
- Confirm closing the last monitored tab disables monitoring.
