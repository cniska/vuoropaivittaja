importScripts("shared.js");

const STORAGE_KEY = "rules";
const {
  normalizeRules,
  clampIntervalMs,
  urlMatches,
  looksLikeXPath
} = self.AutoClickerShared;

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
    args: [rule]
  });

  const frameResults = injectionResults.map((entry) => entry.result).filter(Boolean);
  const clickedFrame = frameResults.find((entry) => entry.clicked);
  if (clickedFrame) {
    return {
      ok: true,
      message: `Clicked the matching element in ${clickedFrame.frameUrl}.`
    };
  }

  const matchedFrame = frameResults.find((entry) => entry.urlMatched);
  if (matchedFrame) {
    return {
      ok: false,
      error: matchedFrame.message || "The selector was not found in the matching frame."
    };
  }

  return {
    ok: false,
    error: "This rule does not match the current page or embedded app frame."
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
    const hasMatchingTab = openTabs.some((tab) =>
      typeof tab.url === "string" && urlMatches(rule.urlPattern, tab.url)
    );

    if (hasMatchingTab) {
      continue;
    }

    const createdTab = await chrome.tabs.create({
      url: rule.targetUrl,
      active: true
    });
    openTabs.push(createdTab);
  }
}

function testRuleInFrame(rule) {
  const urlPattern = String(rule?.urlPattern || "").trim().toLowerCase();
  const selector = String(rule?.selector || "").trim();

  if (!urlPattern || !selector) {
    return {
      frameUrl: location.href,
      urlMatched: false,
      clicked: false,
      message: "URL pattern and selector are required."
    };
  }

  const currentUrl = location.href.toLowerCase();
  if (!currentUrl.includes(urlPattern)) {
    return {
      frameUrl: location.href,
      urlMatched: false,
      clicked: false
    };
  }

  const result = clickSelectorInPage(selector);
  if (!result.clicked) {
    return {
      frameUrl: location.href,
      urlMatched: true,
      clicked: false,
      message: result.message || `Selector not found in ${location.href}.`
    };
  }

  return {
    frameUrl: location.href,
    urlMatched: true,
    clicked: true
  };
}

function clickSelectorInPage(selector) {
  if (looksLikeXPath(selector)) {
    const xpathElement = queryXPath(selector);
    if (!xpathElement) {
      return {
        clicked: false,
        message: `XPath not found in ${location.href}.`
      };
    }

    triggerElementInteraction(xpathElement);
    return {
      clicked: true,
      message: "Clicked the matching XPath element."
    };
  }

  const visited = new Set();
  const queue = [document];

  while (queue.length) {
    const root = queue.shift();
    if (!root || visited.has(root)) {
      continue;
    }

    visited.add(root);

    let element = null;
    try {
      element = root.querySelector(selector);
    } catch {
      return {
        clicked: false,
        message: `Invalid selector: ${selector}`
      };
    }

    if (element) {
      triggerElementInteraction(element);
      return {
        clicked: true,
        message: "Clicked the matching element."
      };
    }

    const shadowHosts = root.querySelectorAll("*");
    for (const host of shadowHosts) {
      if (host.shadowRoot) {
        queue.push(host.shadowRoot);
      }
    }
  }

  return {
    clicked: false,
    message: `Selector not found in ${location.href}.`
  };
}

function queryXPath(selector) {
  try {
    const result = document.evaluate(
      selector,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    return result.singleNodeValue instanceof Element ? result.singleNodeValue : null;
  } catch {
    return null;
  }
}

function triggerElementInteraction(element) {
  element.scrollIntoView({
    block: "center",
    inline: "center",
    behavior: "instant"
  });

  if (typeof element.focus === "function") {
    element.focus({ preventScroll: true });
  }

  const rect = element.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;
  const baseOptions = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    button: 0,
    buttons: 1,
    clientX,
    clientY
  };

  dispatchIfSupported(element, "pointerover", PointerEvent, {
    ...baseOptions,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true
  });
  dispatchIfSupported(element, "mouseover", MouseEvent, baseOptions);
  dispatchIfSupported(element, "pointerdown", PointerEvent, {
    ...baseOptions,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true
  });
  dispatchIfSupported(element, "mousedown", MouseEvent, baseOptions);
  dispatchIfSupported(element, "pointerup", PointerEvent, {
    ...baseOptions,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true
  });
  dispatchIfSupported(element, "mouseup", MouseEvent, baseOptions);
  dispatchIfSupported(element, "click", MouseEvent, baseOptions);

  if (typeof element.click === "function") {
    element.click();
  }
}

function dispatchIfSupported(element, type, EventType, options) {
  if (typeof EventType !== "function") {
    return;
  }

  element.dispatchEvent(new EventType(type, options));
}
