importScripts("shared.js");

const STORAGE_KEY = "rules";
const { normalizeRules, urlMatches } = self.AutoClickerShared;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "activate-sender-tab") {
    void activateSenderTab(sender)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  if (message?.type === "test-rule-in-tab") {
    void testRuleInTab(message.tabId, message.rule)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  return false;
});

chrome.runtime.onStartup.addListener(() => {
  void ensureOpenTabsForEnabledRules();
});

chrome.runtime.onInstalled.addListener(() => {
  void ensureOpenTabsForEnabledRules();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[STORAGE_KEY]) {
    void ensureOpenTabsForEnabledRules();
  }
});

chrome.tabs.onRemoved.addListener(() => {
  void ensureOpenTabsForEnabledRules();
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

async function testRuleInTab(tabId, rule) {
  if (typeof tabId !== "number") {
    throw new Error("No target tab available.");
  }

  const injectionResults = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: testRuleInFrame,
    args: [rule],
  });

  const frameResults = injectionResults
    .map((entry) => entry.result)
    .filter(Boolean);
  const clickedFrame = frameResults.find((entry) => entry.clicked);
  if (clickedFrame) {
    return {
      ok: true,
      message: `Clicked the matching element in ${clickedFrame.frameUrl}.`,
    };
  }

  const matchedFrame = frameResults.find((entry) => entry.urlMatched);
  if (matchedFrame) {
    return {
      ok: false,
      error:
        matchedFrame.message ||
        "The selector was not found in the matching frame.",
    };
  }

  return {
    ok: false,
    error: "This rule does not match the current page or embedded app frame.",
  };
}

async function ensureOpenTabsForEnabledRules() {
  const stored = await chrome.storage.local.get({ [STORAGE_KEY]: [] });
  const rules = normalizeRules(stored[STORAGE_KEY], { requireId: true });
  const enabledRules = rules.filter((rule) => rule.enabled && rule.targetUrl);
  if (!enabledRules.length) {
    return;
  }

  const openTabs = await chrome.tabs.query({});
  for (const rule of enabledRules) {
    const hasMatchingTab = openTabs.some(
      (tab) =>
        typeof tab.url === "string" && urlMatches(rule.urlPattern, tab.url)
    );

    if (hasMatchingTab) {
      continue;
    }

    const createdTab = await chrome.tabs.create({
      url: rule.targetUrl,
      active: true,
    });
    openTabs.push(createdTab);
  }
}

function testRuleInFrame(rule) {
  const urlPattern = String(rule?.urlPattern || "")
    .trim()
    .toLowerCase();
  const selector = String(rule?.selector || "").trim();

  if (!urlPattern || !selector) {
    return {
      frameUrl: location.href,
      urlMatched: false,
      clicked: false,
      message: "URL pattern and selector are required.",
    };
  }

  const currentUrl = location.href.toLowerCase();
  if (!currentUrl.includes(urlPattern)) {
    return {
      frameUrl: location.href,
      urlMatched: false,
      clicked: false,
    };
  }

  const result = clickSelectorInPage(selector);
  if (!result.clicked) {
    return {
      frameUrl: location.href,
      urlMatched: true,
      clicked: false,
      message: result.message || `Selector not found in ${location.href}.`,
    };
  }

  return {
    frameUrl: location.href,
    urlMatched: true,
    clicked: true,
  };
}
