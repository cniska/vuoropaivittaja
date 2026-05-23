const { normalizeSettings, normalizeRule } = globalThis.VuoropaivittajaShared;

const SETTINGS_KEY = "settings";
const RULE_KEY = "rule";
const PICK_RESULT_KEY = "lastPickedElement";
const DRAFT_KEY = "draftRule";
const MIN_INTERVAL_S = 2;
const STATUS_DISMISS_MS = 5000;

const enabledInput = document.getElementById("enabled");
const notificationsInput = document.getElementById("notifications");
const soundInput = document.getElementById("sound");
const minIntervalInput = document.getElementById("min-interval");
const maxIntervalInput = document.getElementById("max-interval");
const targetUrlDisplay = document.getElementById("target-url-display");
const selectorInput = document.getElementById("selector");
const pickElementButton = document.getElementById("pick-element");
const testSelectorButton = document.getElementById("test-selector");
const statusEl = document.getElementById("status");

let activeTab = null;
let pickedFrameId = null;
let statusTimer = null;

void initialize();

async function initialize() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab ?? null;

  const stored = await chrome.storage.local.get({
    [SETTINGS_KEY]: {},
    [RULE_KEY]: {},
  });

  fillSettings(normalizeSettings(stored[SETTINGS_KEY]));
  fillRule(normalizeRule(stored[RULE_KEY]));

  await loadDraft();
  await loadPickedElement();
}

enabledInput.addEventListener("change", autosaveSettings);
notificationsInput.addEventListener("change", autosaveSettings);
soundInput.addEventListener("change", autosaveSettings);
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

  await chrome.storage.local.set({
    [SETTINGS_KEY]: {
      enabled: enabledInput.checked,
      notifications: notificationsInput.checked,
      sound: soundInput.checked,
      minIntervalMs: minSec * 1000,
      maxIntervalMs: maxSec * 1000,
    },
  });
  setStatus("Tallennettu.");
}

async function autosaveRule(showToast = true) {
  await chrome.storage.local.set({
    [RULE_KEY]: {
      urlPattern: urlPatternFromTab(),
      selector: selectorInput.value.trim(),
      listSelector: "",
    },
  });
  if (showToast) {
    setStatus("Tallennettu.");
  }
}

pickElementButton.addEventListener("click", async () => {
  if (!activeTab?.id) {
    setStatus("Avaa kohdesivusto ensin.", true);
    return;
  }

  try {
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
      files: ["content.js"],
    });
    return chrome.tabs.sendMessage(activeTab.id, message, sendOptions);
  }
}
