importScripts("shared.js");

const { normalizeSettings, normalizeRule, urlMatches } =
  self.VuoropaivittajaShared;

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "change-detected") {
    void chrome.notifications.create("vuoropaivittaja-change", {
      type: "basic",
      iconUrl: "icon.png",
      title: "Vuoropäivittäjä",
      message: "Uusia vuoroja saattaa olla saatavilla.",
    });
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.lastPickedElement?.newValue) {
    void chrome.action.openPopup().catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener(() => {
  void disableIfNoMatchingTab();
});

async function disableIfNoMatchingTab() {
  const stored = await chrome.storage.local.get({ settings: {}, rule: {} });
  const settings = normalizeSettings(stored.settings);
  const rule = normalizeRule(stored.rule);

  if (!settings.enabled || !rule) return;

  const openTabs = await chrome.tabs.query({});
  const hasMatchingTab = openTabs.some(
    (tab) => typeof tab.url === "string" && urlMatches(rule.urlPattern, tab.url)
  );

  if (!hasMatchingTab) {
    const rawSettings =
      typeof stored.settings === "object" ? stored.settings : {};
    await chrome.storage.local.set({
      settings: { ...rawSettings, enabled: false },
    });
  }
}
