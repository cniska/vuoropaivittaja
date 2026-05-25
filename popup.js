const {
  normalizeSettings,
  normalizeRule,
  normalizeSlotHistoryMap,
  createLogger,
} = globalThis.VuoropaivittajaShared;

const SETTINGS_KEY = "settings";
const RULE_KEY = "rule";
const PICK_RESULT_KEY = "lastPickedElement";
const DRAFT_KEY = "draftRule";
const SLOT_HISTORY_KEY = "slotHistory";
const MIN_INTERVAL_S = 2;
const STATUS_DISMISS_MS = 5000;
const HISTORY_LOAD_SIZE = 20;

const enabledInput = document.getElementById("enabled");
const notificationsInput = document.getElementById("notifications");
const soundInput = document.getElementById("sound");
const debugLoggingInput = document.getElementById("debug-logging");
const minIntervalInput = document.getElementById("min-interval");
const maxIntervalInput = document.getElementById("max-interval");
const targetUrlDisplay = document.getElementById("target-url-display");
const selectorInput = document.getElementById("selector");
const pickElementButton = document.getElementById("pick-element");
const testSelectorButton = document.getElementById("test-selector");
const statusEl = document.getElementById("status");
const historyList = document.getElementById("history-list");
const clearHistoryButton = document.getElementById("clear-history");

let activeTab = null;
let pickedFrameId = null;
let statusTimer = null;
let logger = createLogger("popup", () => debugLoggingInput.checked);
let historyVisible = 20;
let historyEntries = [];

void initialize();

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "monitor-clicked") {
    logger.info("Refresh button clicked", {
      event: "monitor-clicked",
      ok: Boolean(message.ok),
      message: String(message.message || ""),
    });
    setStatus(
      String(message.message || "Päivitä-painiketta klikattiin."),
      !message.ok
    );
  }
});

async function initialize() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab ?? null;

  const stored = await chrome.storage.local.get({
    [SETTINGS_KEY]: {},
    [RULE_KEY]: {},
    [SLOT_HISTORY_KEY]: {},
  });

  fillSettings(normalizeSettings(stored[SETTINGS_KEY]));
  fillRule(normalizeRule(stored[RULE_KEY]));
  logger = createLogger("popup", () => debugLoggingInput.checked);

  setHistoryEntries(domainHistory(stored[SLOT_HISTORY_KEY]));

  await loadDraft();
  await loadPickedElement();
}

enabledInput.addEventListener("change", autosaveSettings);
notificationsInput.addEventListener("change", autosaveSettings);
soundInput.addEventListener("change", autosaveSettings);
debugLoggingInput.addEventListener("change", autosaveSettings);
minIntervalInput.addEventListener("change", autosaveSettings);
maxIntervalInput.addEventListener("change", autosaveSettings);
selectorInput.addEventListener("change", () => {
  void autosaveRule();
});
selectorInput.addEventListener("input", () => {
  pickedFrameId = null;
});

async function autosaveSettings() {
  const minSec = Math.max(
    MIN_INTERVAL_S,
    Number(minIntervalInput.value) || MIN_INTERVAL_S
  );
  const maxSec = Math.max(minSec, Number(maxIntervalInput.value) || minSec);
  minIntervalInput.value = String(minSec);
  maxIntervalInput.value = String(maxSec);

  const nextSettings = {
    enabled: enabledInput.checked,
    notifications: notificationsInput.checked,
    sound: soundInput.checked,
    debugLogging: debugLoggingInput.checked,
    minIntervalMs: minSec * 1000,
    maxIntervalMs: maxSec * 1000,
  };

  try {
    await chrome.storage.local.set({
      [SETTINGS_KEY]: nextSettings,
    });
    logger.info("Settings saved", {
      event: "autosave-settings",
      ...nextSettings,
    });
    setStatus("Tallennettu.");
  } catch (error) {
    logger.error("Settings save failed", {
      event: "autosave-settings-failed",
      message: String(error?.message || error || ""),
    });
    setStatus("Tallennus epäonnistui.", true);
  }
}

async function autosaveRule(showToast = true) {
  const nextRule = {
    urlPattern: urlPatternFromTab(),
    selector: selectorInput.value.trim(),
    listSelector: "",
  };

  try {
    await chrome.storage.local.set({
      [RULE_KEY]: nextRule,
    });
    if (showToast) {
      setStatus("Tallennettu.");
    }
    logger.info("Selector saved", {
      event: "autosave-rule",
      ...nextRule,
    });
  } catch (error) {
    logger.error("Selector save failed", {
      event: "autosave-rule-failed",
      message: String(error?.message || error || ""),
    });
    setStatus("Tallennus epäonnistui.", true);
  }
}

pickElementButton.addEventListener("click", async () => {
  if (!activeTab?.id) {
    setStatus("Avaa kohdesivusto ensin.", true);
    return;
  }

  try {
    logger.info("Picker started", { event: "start-picker" });
    await saveDraft();
    await sendToActiveTab({ type: "start-picker" });
    window.close();
  } catch {
    setStatus(
      "Valitsin ei käynnistynyt. Lataa sivu uudelleen ja yritä uudelleen.",
      true
    );
  }
});

testSelectorButton.addEventListener("click", async () => {
  if (!activeTab?.id) {
    setStatus("Avaa kohdesivusto ensin.", true);
    return;
  }

  const selector = selectorInput.value.trim();
  if (!selector) {
    setStatus("Syötä valitsin ensin.", true);
    return;
  }

  try {
    setStatus("Testataan...");
    logger.info("Testing selector", {
      event: "test-selector",
      selector,
      frameId: pickedFrameId,
    });
    const response = await sendToActiveTab(
      {
        type: "test-rule",
        rule: { urlPattern: urlPatternFromTab(), selector },
      },
      { frameId: pickedFrameId }
    );
    setStatus(
      response?.ok
        ? response.message
        : (response?.error ?? "Testi epäonnistui."),
      !response?.ok
    );
  } catch {
    setStatus("Sivuun ei saatu yhteyttä. Lataa sivu uudelleen ja yritä.", true);
  }
});

function fillSettings(settings) {
  enabledInput.checked = settings.enabled;
  notificationsInput.checked = settings.notifications;
  soundInput.checked = settings.sound;
  debugLoggingInput.checked = settings.debugLogging;
  minIntervalInput.value = String(settings.minIntervalMs / 1000);
  maxIntervalInput.value = String(settings.maxIntervalMs / 1000);
}

function fillRule(rule) {
  if (rule) selectorInput.value = rule.selector;
  targetUrlDisplay.textContent = urlPatternFromTab() || "Ei asetettu";
}

function setStatus(message, isError = false) {
  clearTimeout(statusTimer);
  statusEl.textContent = "";
  statusEl.dataset.state = isError ? "error" : "success";
  statusEl.classList.add("is-visible");
  window.requestAnimationFrame(() => {
    statusEl.textContent = message;
  });
  statusTimer = window.setTimeout(() => {
    statusEl.classList.remove("is-visible");
    statusEl.textContent = "";
  }, STATUS_DISMISS_MS);
}

function urlPatternFromTab() {
  try {
    return new URL(activeTab?.url ?? "").origin;
  } catch {
    return "";
  }
}

async function saveDraft() {
  await chrome.storage.local.set({
    [DRAFT_KEY]: { selector: selectorInput.value.trim() },
  });
}

async function loadDraft() {
  const stored = await chrome.storage.local.get({ [DRAFT_KEY]: null });
  const draft = stored[DRAFT_KEY];
  if (!draft || typeof draft !== "object") return;

  selectorInput.value = String(draft.selector ?? "");
  await chrome.storage.local.remove(DRAFT_KEY);
}

async function loadPickedElement() {
  const stored = await chrome.storage.local.get({ [PICK_RESULT_KEY]: null });
  const picked = stored[PICK_RESULT_KEY];
  if (!picked?.selector) return;

  selectorInput.value = picked.selector;
  pickedFrameId =
    picked.tabId === activeTab?.id && Number.isInteger(picked.frameId)
      ? picked.frameId
      : null;
  await autosaveRule(false);
  await chrome.storage.local.remove(PICK_RESULT_KEY);
  setStatus("Painike valittu sivulta.");
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[SLOT_HISTORY_KEY]) {
    setHistoryEntries(domainHistory(changes[SLOT_HISTORY_KEY].newValue));
  }
});

clearHistoryButton.addEventListener("click", async () => {
  if (!window.confirm("Tyhjennetäänkö koko vuorohistoria?")) return;
  try {
    const urlPattern = urlPatternFromTab();
    const stored = await chrome.storage.local.get({ [SLOT_HISTORY_KEY]: {} });
    const all = normalizeSlotHistoryMap(stored[SLOT_HISTORY_KEY]);
    await chrome.storage.local.set({
      [SLOT_HISTORY_KEY]: { ...all, [urlPattern]: [] },
    });
    setHistoryEntries([]);
  } catch {
    setStatus("Historian tyhjennys epäonnistui.", true);
  }
});

function setHistoryEntries(entries) {
  historyEntries = entries.slice().sort((a, b) => {
    const dateA = parseSlotDate(a.text);
    const dateB = parseSlotDate(b.text);
    if (dateA && dateB && dateA !== dateB) return dateB.localeCompare(dateA);
    return b.lastSeen.localeCompare(a.lastSeen);
  });
  historyVisible = HISTORY_LOAD_SIZE;
  renderHistory();
}

function parseSlotDate(text) {
  const match = text.match(/(\d{1,2})\.(\d{1,2})\./);
  if (!match) return "";
  return `${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function renderHistory() {
  const total = historyEntries.length;

  if (total === 0) {
    historyList.innerHTML =
      '<p class="history-empty">Ei tallennettuja vuoroja.</p>';
    return;
  }

  const visible = historyEntries.slice(0, historyVisible);
  const hasMore = historyVisible < total;

  const items = visible
    .map(
      (entry) => `<div role="listitem" class="history-item">
        <span class="history-item-text">${escapeHtml(entry.text)}</span>
        <span class="history-item-meta">Nähty ${formatTimestamp(entry.lastSeen)}</span>
      </div>`
    )
    .join("");

  const loadMore = hasMore
    ? `<button type="button" class="history-load-more" id="history-load-more">Lataa lisää (${total - historyVisible})</button>`
    : "";

  historyList.innerHTML = items + loadMore;

  if (hasMore) {
    document
      .getElementById("history-load-more")
      .addEventListener("click", () => {
        historyVisible += HISTORY_LOAD_SIZE;
        renderHistory();
      });
  }
}

function formatTimestamp(iso) {
  try {
    return new Date(iso).toLocaleString("fi-FI", {
      day: "numeric",
      month: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function domainHistory(all) {
  const urlPattern = urlPatternFromTab();
  if (!urlPattern) return [];
  const map = normalizeSlotHistoryMap(all);
  return Array.isArray(map[urlPattern]) ? map[urlPattern] : [];
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendToActiveTab(message, options = {}) {
  if (!activeTab?.id) throw new Error("Ei aktiivista välilehteä.");
  const sendOptions =
    Number.isInteger(options.frameId) && options.frameId >= 0
      ? { frameId: options.frameId }
      : undefined;

  try {
    return await chrome.tabs.sendMessage(activeTab.id, message, sendOptions);
  } catch (error) {
    if (!error?.message?.includes("Receiving end does not exist")) throw error;
    await chrome.scripting.executeScript({
      target: { tabId: activeTab.id, allFrames: true },
      files: ["shared.js", "content-helpers.js", "content.js"],
    });
    return chrome.tabs.sendMessage(activeTab.id, message, sendOptions);
  }
}
