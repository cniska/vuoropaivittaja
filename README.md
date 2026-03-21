# Auto Clicker Chrome Extension

This Chrome extension lets you save multiple auto-click rules. Each rule has:

- A `URL contains` value to decide which website it should run on
- A CSS selector for the button or element to click
- Its own interval in minutes
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
4. Enter the button selector and interval
5. Save the rule

The extension keeps one timer per enabled rule and clicks the matching selector in any open tab whose URL contains the saved text.

## Sharing with a friend

The easiest way to share it directly is to send your friend this folder as a zip file. They can load it with **Load unpacked** in Chrome.

If you want them to install it like a normal extension without enabling developer mode, you would need to publish it to the Chrome Web Store, which does require Google review and approval.
