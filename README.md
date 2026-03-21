# Auto Clicker Chrome Extension

This Chrome extension lets you save multiple auto-click rules. Each rule has:

- A `URL contains` value to decide which website it should run on
- A CSS selector or XPath for the button or element to click
- An optional setting to activate the tab before clicking
- Its own interval in milliseconds
- An enabled or disabled state

## Load it in Chrome

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked**
4. Select this folder

## How to use it

1. Open the website you want to automate in Chrome
2. Click the extension icon
3. Use **Use current site** to fill the site automatically
4. Click **Pick from page** if you want to choose the exact button visually
5. Enter or confirm the button selector and interval in milliseconds
6. Save the rule

When the picker sees duplicate matching elements, it tries to generate a more specific selector automatically. If CSS stays ambiguous, it can fall back to XPath such as `(//button[@aria-label='Päivitä luettelo'])[2]`.

The extension runs one timer per enabled rule inside matching tabs and clicks the matching selector whenever the interval elapses.

The click loop only runs while the target page is visible, so this setup is intended for use on the active tab.

## Timing note

You can now enter short intervals like `500` for 500 ms or `1000` for 1 second.

Chrome may still throttle timers in inactive or background tabs, so very fast intervals are best when the target tab stays open and active.

## Tests

There is a lightweight Node test suite for the shared rule and selector helpers.

Run it with:

```bash
npm test
```

## Sharing with a friend

The easiest way to share it directly is to send your friend this folder as a zip file. They can load it with **Load unpacked** in Chrome.

If you want them to install it like a normal extension without enabling developer mode, you would need to publish it to the Chrome Web Store, which does require Google review and approval.

## Tampermonkey Alternative

If the Chrome extension is still too brittle on the Power Apps page, there is also a Tampermonkey userscript in [tampermonkey-auto-clicker.user.js](/Users/cniska/code/auto-clicker/tampermonkey-auto-clicker.user.js).

How to use it:

1. Install the Tampermonkey extension in Chrome
2. Create a new script
3. Paste in the contents of `tampermonkey-auto-clicker.user.js`
4. Save it
5. Open your Power Apps page
6. Adjust the config block at the top if needed

Useful defaults:

- `selector: 'button[aria-label="Päivitä luettelo"]'`
- `matchIndex: 2`
- `intervalMs: 1000`

After the page loads, you can also control it from DevTools console:

- `powerAppsAutoClicker.help()`
- `powerAppsAutoClicker.clickNow()`
- `powerAppsAutoClicker.start()`
- `powerAppsAutoClicker.stop()`
- `powerAppsAutoClicker.setConfig({ matchIndex: 2, intervalMs: 1500 })`
