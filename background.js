importScripts("shared.js");

const { normalizeSettings, normalizeRule, shouldMonitorTab, urlMatches } =
  self.VuoropaivittajaShared;

const OFFSCREEN_DOCUMENT = "offscreen.html";
const PICK_RESULT_KEY = "lastPickedElement";
let creatingOffscreenDocument = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "change-detected") {
    void fireChangeAlert(message)
      .catch(() => {})
      .finally(() => {
        sendResponse({ ok: true });
      });
    return true;
  }

  if (message?.type === "element-picked") {
    void chrome.storage.local.set({
      [PICK_RESULT_KEY]: {
        selector: String(message.selector || ""),
        url: sender.url ?? "",
        frameId: sender.frameId,
        tabId: sender.tab?.id,
        timestamp: Date.now(),
      },
    });
    return false;
  }

  if (message?.type === "should-monitor-tab") {
    const settings = normalizeSettings(message.settings);
    const rule = normalizeRule(message.rule);
    const tabUrl = sender.tab?.url ?? "";
    sendResponse({
      ok: true,
      shouldMonitor: shouldMonitorTab(settings, rule, tabUrl),
    });
    return false;
  }

  return false;
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

async function fireChangeAlert(message) {
  const alerts = [];

  if (message.notifications) {
    alerts.push(
      chrome.notifications.create("vuoropaivittaja-change", {
        type: "basic",
        iconUrl: "icon.png",
        title: "Vuoropäivittäjä",
        message: "Uusia vuoroja saattaa olla saatavilla.",
      })
    );
  }

  if (message.sound) {
    alerts.push(playAlertSound());
  }

  await Promise.allSettled(alerts);
}

async function playAlertSound() {
  await ensureOffscreenDocument();
  await chrome.runtime.sendMessage({ type: "play-alert-sound" });
}

async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [offscreenUrl],
  });

  if (contexts.length > 0) {
    return;
  }

  if (!creatingOffscreenDocument) {
    creatingOffscreenDocument = chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT,
      reasons: ["AUDIO_PLAYBACK"],
      justification: "Soitetaan ilmoitusääni, kun uusia vuoroja havaitaan.",
    });
  }

  try {
    await creatingOffscreenDocument;
  } finally {
    creatingOffscreenDocument = null;
  }
}
