const STORAGE_KEY = "rules";
const ALARM_PREFIX = "auto-click-rule:";

chrome.runtime.onInstalled.addListener(() => {
  void syncAlarms();
});

chrome.runtime.onStartup.addListener(() => {
  void syncAlarms();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[STORAGE_KEY]) {
    void syncAlarms();
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) {
    return;
  }

  const ruleId = alarm.name.slice(ALARM_PREFIX.length);
  void runRuleById(ruleId);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "test-rule") {
    void runRuleOnDemand(message.rule, message.tabId)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

async function getRules() {
  const stored = await chrome.storage.local.get({ [STORAGE_KEY]: [] });
  return normalizeRules(stored[STORAGE_KEY]);
}

function normalizeRules(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((rule) => rule && typeof rule === "object")
    .map((rule) => ({
      id: String(rule.id || ""),
      name: String(rule.name || "").trim(),
      urlPattern: String(rule.urlPattern || "").trim(),
      selector: String(rule.selector || "").trim(),
      intervalMinutes: clampInterval(rule.intervalMinutes),
      enabled: Boolean(rule.enabled)
    }))
    .filter((rule) => rule.id && rule.urlPattern && rule.selector);
}

function clampInterval(intervalMinutes) {
  const value = Number(intervalMinutes);
  if (!Number.isFinite(value)) {
    return 5;
  }

  return Math.max(1, value);
}

async function syncAlarms() {
  const alarms = await chrome.alarms.getAll();
  await Promise.all(
    alarms
      .filter((alarm) => alarm.name.startsWith(ALARM_PREFIX))
      .map((alarm) => chrome.alarms.clear(alarm.name))
  );

  const rules = await getRules();
  await Promise.all(
    rules
      .filter((rule) => rule.enabled)
      .map((rule) =>
        chrome.alarms.create(`${ALARM_PREFIX}${rule.id}`, {
          delayInMinutes: rule.intervalMinutes,
          periodInMinutes: rule.intervalMinutes
        })
      )
  );
}

async function runRuleById(ruleId) {
  const rules = await getRules();
  const rule = rules.find((entry) => entry.id === ruleId && entry.enabled);
  if (!rule) {
    return;
  }

  await executeRule(rule);
}

async function runRuleOnDemand(rule, tabId) {
  const normalizedRule = normalizeRules([{ ...rule, id: "preview", enabled: true }])[0];
  if (!normalizedRule) {
    return { ok: false, error: "Please enter a valid URL pattern and selector first." };
  }

  const results = await executeRule(normalizedRule, typeof tabId === "number" ? [tabId] : null);
  return summarizeRun(results);
}

async function executeRule(rule, specificTabIds = null) {
  const tabs = specificTabIds
    ? await Promise.all(
        specificTabIds.map(async (tabId) => {
          try {
            return await chrome.tabs.get(tabId);
          } catch {
            return null;
          }
        })
      )
    : await chrome.tabs.query({});

  const matchingTabs = tabs.filter(
    (tab) =>
      tab &&
      typeof tab.id === "number" &&
      typeof tab.url === "string" &&
      urlMatches(rule.urlPattern, tab.url)
  );

  const executions = await Promise.all(
    matchingTabs.map(async (tab) => {
      try {
        const [{ result }] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: clickSelectorInPage,
          args: [rule.selector]
        });

        return {
          ok: true,
          tabId: tab.id,
          url: tab.url,
          result
        };
      } catch (error) {
        return {
          ok: false,
          tabId: tab.id,
          url: tab.url,
          error: error.message
        };
      }
    })
  );

  return executions;
}

function summarizeRun(results) {
  if (!results.length) {
    return {
      ok: false,
      error: "No open tabs matched this rule."
    };
  }

  const clicked = results.filter((entry) => entry.ok && entry.result?.clicked);
  if (clicked.length) {
    return {
      ok: true,
      message: `Clicked ${clicked.length} matching tab${clicked.length === 1 ? "" : "s"}.`
    };
  }

  const firstFailure = results.find((entry) => !entry.ok || !entry.result?.clicked);
  return {
    ok: false,
    error:
      firstFailure?.error ||
      firstFailure?.result?.message ||
      "The selector was not found on the matching tab."
  };
}

function urlMatches(pattern, url) {
  return url.toLowerCase().includes(pattern.toLowerCase());
}

function clickSelectorInPage(selector) {
  const visited = new Set();
  const queue = [document];

  while (queue.length) {
    const root = queue.shift();
    if (!root || visited.has(root)) {
      continue;
    }

    visited.add(root);

    const element = root.querySelector(selector);
    if (element) {
      element.click();
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
    message: "Selector was not found on the page."
  };
}
