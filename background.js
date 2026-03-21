chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "activate-sender-tab") {
    return false;
  }

  void activateSenderTab(sender)
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

async function activateSenderTab(sender) {
  if (!sender.tab?.id) {
    throw new Error("No sender tab available.");
  }

  if (typeof sender.tab.windowId === "number") {
    await chrome.windows.update(sender.tab.windowId, { focused: true });
  }

  await chrome.tabs.update(sender.tab.id, { active: true });
}
