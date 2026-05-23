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
- Slot history or analytics.
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

## Monitoring requirements

- Monitoring starts only when monitoring is enabled, a valid rule exists, and the active top-level tab URL matches the stored origin pattern.
- The content script must work in pages that use frames.
- The refresh control can live inside a frame, and the chosen selector must still work when tested later.
- The monitored snapshot should prefer the visible slot list when it exists, and fall back to page text when it does not.
- The comparison should be based on the visible content before and after the refresh click.
- When the snapshot changes, the extension sends an alert request to the background worker.
- A failed monitor cycle must not crash the content script or block later cycles.

## Picker requirements

- The picker shows an overlay on the page and a short Finnish hint.
- Esc cancels the picker.
- Clicking the refresh control selects it.
- The picker should prefer stable selectors.
- Avoid double-activating the target element. One synthetic activation sequence is enough.
- The picker must support refresh buttons inside frames.

## Background requirements

- Background code receives change alerts and handles notification and sound delivery.
- Notification and sound handling are independent. One failing channel must not block the other.
- If notifications are enabled, the user gets a Chrome desktop notification.
- If sound is enabled, the user gets a short alert beep through an offscreen document.
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
- Slot items should show weekday, date, shift, and an optional `Uusi` badge.
- New slots should be queued in the background and appear only when refresh is clicked.
- Some refresh cycles should intentionally make no visible change so no-change behavior can be verified.
- New slots should appear first in the list.

## Testability requirements

- Unit tests should cover settings normalization, rule normalization, URL matching, alert message construction, snapshot comparison, and the main monitoring decision logic.
- Pure helper logic should be extracted where needed so it can be tested without a browser.
- Browser-specific behavior should be kept behind thin seams.

## Failure handling

- Popup-visible errors must be Finnish.
- Autosave failures may remain silent unless the user explicitly triggered the action.
- Picker startup and test failures must show a toast.
- Background alert failures must not block the other alert channel.
- Content scripts must tolerate inaccessible pages, reloaded tabs, and stale frame contexts.

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
