importScripts("shared.js");

const {
  normalizeSettings,
  normalizeRule,
  shouldMonitorTab,
  mergeSlotHistory,
  urlMatches,
  createLogger,
} = self.VuoropaivittajaShared;

const OFFSCREEN_DOCUMENT = "offscreen.html";
const PICK_RESULT_KEY = "lastPickedElement";
let creatingOffscreenDocument = null;
let debugLoggingEnabled = false;
const logger = createLogger("background", () => debugLoggingEnabled);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "change-detected") {
    debugLoggingEnabled = Boolean(message.debugLogging);
    logger.info("Change detected", {
      event: "change-detected",
      notifications: Boolean(message.notifications),
      sound: Boolean(message.sound),
      debugLogging: debugLoggingEnabled,
    });
    void fireChangeAlert(message)
      .catch(() => {})
      .finally(() => {
        sendResponse({ ok: true });
      });
    return true;
  }

  if (message?.type === "element-picked") {
    logger.info("Element picked from page", {
      event: "element-picked",
      selector: String(message.selector || ""),
      tabId: sender.tab?.id ?? null,
      frameId: sender.frameId ?? null,
    });
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

  if (message?.type === "stop-picker") {
    logger.info("Picker closed", {
      event: "picker-closed",
      tabId: sender.tab?.id ?? null,
      frameId: sender.frameId ?? null,
    });
    if (sender.tab?.id) {
      void chrome.tabs
        .sendMessage(sender.tab.id, { type: "stop-picker" })
        .catch(() => {});
    }
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "update-slot-history") {
    if (Array.isArray(message.slots) && message.slots.length > 0) {
      void updateSlotHistory(message.slots);
    }
    return false;
  }

  if (message?.type === "should-monitor-tab") {
    const settings = normalizeSettings(message.settings);
    const rule = normalizeRule(message.rule);
    const tabUrl = sender.tab?.url ?? "";
    debugLoggingEnabled = Boolean(settings.debugLogging);
    logger.info("Checking whether the tab should be monitored", {
      event: "should-monitor-tab",
      shouldMonitor: shouldMonitorTab(settings, rule, tabUrl),
      tabUrl,
      urlPattern: rule?.urlPattern ?? "",
    });
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
    logger.info(
      "Monitoring was disabled because the last matching tab closed",
      {
        event: "disabled-on-tab-close",
        urlPattern: rule.urlPattern,
      }
    );
  }
}

async function fireChangeAlert(message) {
  const alerts = [];

  if (message.notifications) {
    alerts.push(createNotification());
  }

  if (message.sound) {
    alerts.push(playAlertSound());
  }

  await Promise.allSettled(alerts);
}

async function updateSlotHistory(slots) {
  try {
    const stored = await chrome.storage.local.get({ slotHistory: [] });
    const merged = mergeSlotHistory(stored.slotHistory, slots);
    await chrome.storage.local.set({ slotHistory: merged });
    logger.info("Slot history updated", {
      event: "slot-history-updated",
      added: slots.length,
      total: merged.length,
    });
  } catch (error) {
    logger.warn("Slot history update failed", {
      event: "slot-history-update-failed",
      message: String(error?.message || error || ""),
    });
  }
}

async function createNotification() {
  const permissionLevel = await chrome.notifications.getPermissionLevel();
  logger.info("Checking desktop notification permission", {
    event: "notification-permission",
    permissionLevel,
  });
  if (permissionLevel !== "granted") {
    return;
  }

  try {
    await chrome.notifications.create(notificationId(), {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icon.png"),
      title: "Vuoropäivittäjä",
      message: "Uusia vuoroja saattaa olla saatavilla.",
    });
    logger.info("Desktop notification sent", {
      event: "notification-created",
      notificationId: "generated",
    });
  } catch {
    logger.warn("Desktop notification creation failed", {
      event: "notification-create-failed",
    });
  }
}

async function playAlertSound() {
  logger.info("Playing alert sound", {
    event: "play-alert-sound",
  });
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

function notificationId() {
  return `vuoropaivittaja-change-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}
