importScripts("shared.js");

const { normalizeSettings, normalizeRule, urlMatches } =
  self.VuoropaivittajaShared;

chrome.runtime.onStartup.addListener(() => {
  void ensureTabOpen();
});

chrome.runtime.onInstalled.addListener(() => {
  void ensureTabOpen();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && (changes["settings"] || changes["rule"])) {
    void ensureTabOpen();
  }
});

chrome.tabs.onRemoved.addListener(() => {
  void ensureTabOpen();
});

async function ensureTabOpen() {
  const stored = await chrome.storage.local.get({ settings: {}, rule: {} });
  const settings = normalizeSettings(stored.settings);
  const rule = normalizeRule(stored.rule);

  if (!settings.enabled || !rule || !rule.targetUrl) {
    return;
  }

  const openTabs = await chrome.tabs.query({});
  const hasMatchingTab = openTabs.some(
    (tab) => typeof tab.url === "string" && urlMatches(rule.urlPattern, tab.url)
  );

  if (!hasMatchingTab) {
    await chrome.tabs.create({ url: rule.targetUrl, active: true });
  }
}
