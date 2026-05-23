const { normalizeSettings, normalizeRule } = globalThis.VuoropaivittajaShared;

const SETTINGS_KEY = "settings";
const RULE_KEY = "rule";
const PICK_RESULT_KEY = "lastPickedElement";
const DRAFT_KEY = "draftRule";

const enabledInput = document.getElementById("enabled");
const notificationsInput = document.getElementById("notifications");
const soundInput = document.getElementById("sound");
const minIntervalInput = document.getElementById("min-interval");
const maxIntervalInput = document.getElementById("max-interval");
const targetUrlDisplay = document.getElementById("target-url-display");
const setCurrentSiteButton = document.getElementById("set-current-site");
const selectorInput = document.getElementById("selector");
const pickElementButton = document.getElementById("pick-element");
const testSelectorButton = document.getElementById("test-selector");
const saveButton = document.getElementById("save");
const statusEl = document.getElementById("status");

let activeTab = null;
let savedTargetUrl = "";
let savedUrlPattern = "";

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

saveButton.addEventListener("click", async () => {
  const minSec = Number(minIntervalInput.value);
  const maxSec = Number(maxIntervalInput.value);

  if (!Number.isFinite(minSec) || minSec < 2) {
    setStatus("Minimitarkkailuväli on vähintään 2 sekuntia.", true);
    return;
  }

  if (!Number.isFinite(maxSec) || maxSec < minSec) {
    setStatus("Maksimitarkkailuväli ei voi olla pienempi kuin minimi.", true);
    return;
  }

  await chrome.storage.local.set({
    [SETTINGS_KEY]: {
      enabled: enabledInput.checked,
      notifications: notificationsInput.checked,
      sound: soundInput.checked,
      minIntervalMs: minSec * 1000,
      maxIntervalMs: maxSec * 1000,
    },
    [RULE_KEY]: {
      urlPattern: savedUrlPattern,
      selector: selectorInput.value.trim(),
      listSelector: "",
      targetUrl: savedTargetUrl,
    },
  });

  setStatus("Tallennettu.");
});

setCurrentSiteButton.addEventListener("click", () => {
  if (!activeTab?.url) {
    setStatus("Ei aktiivista välilehteä.", true);
    return;
  }

  savedTargetUrl = activeTab.url;
  savedUrlPattern = originOf(activeTab.url);
  targetUrlDisplay.textContent = activeTab.url;
  setStatus("Nykyinen sivu asetettu.");
});

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
    setStatus("Valitsin ei käynnistynyt. Lataa sivu uudelleen ja yritä uudelleen.", true);
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
    const response = await sendToActiveTab({
      type: "test-rule",
      rule: { urlPattern: savedUrlPattern || originOf(activeTab.url ?? ""), selector },
    });
    setStatus(
      response?.ok ? response.message : (response?.error ?? "Testi epäonnistui."),
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
  if (!rule) return;
  savedUrlPattern = rule.urlPattern;
  savedTargetUrl = rule.targetUrl;
  selectorInput.value = rule.selector;
  targetUrlDisplay.textContent = rule.targetUrl || "Ei asetettu";
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.dataset.state = isError ? "error" : "success";
}

async function saveDraft() {
  await chrome.storage.local.set({
    [DRAFT_KEY]: {
      urlPattern: savedUrlPattern,
      targetUrl: savedTargetUrl,
      selector: selectorInput.value.trim(),
    },
  });
}

async function loadDraft() {
  const stored = await chrome.storage.local.get({ [DRAFT_KEY]: null });
  const draft = stored[DRAFT_KEY];
  if (!draft || typeof draft !== "object") return;

  savedUrlPattern = String(draft.urlPattern ?? "");
  savedTargetUrl = String(draft.targetUrl ?? "");
  selectorInput.value = String(draft.selector ?? "");
  if (savedTargetUrl) targetUrlDisplay.textContent = savedTargetUrl;

  await chrome.storage.local.remove(DRAFT_KEY);
}

async function loadPickedElement() {
  const stored = await chrome.storage.local.get({ [PICK_RESULT_KEY]: null });
  const picked = stored[PICK_RESULT_KEY];
  if (!picked?.selector) return;

  selectorInput.value = picked.selector;
  if (picked.url) {
    savedTargetUrl = picked.url;
    savedUrlPattern = originOf(picked.url);
    targetUrlDisplay.textContent = picked.url;
  }

  await chrome.storage.local.remove(PICK_RESULT_KEY);
  setStatus("Painike valittu sivulta.");
}

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

async function sendToActiveTab(message) {
  if (!activeTab?.id) throw new Error("Ei aktiivista välilehteä.");

  try {
    return await chrome.tabs.sendMessage(activeTab.id, message);
  } catch (error) {
    if (!error?.message?.includes("Receiving end does not exist")) throw error;
    await chrome.scripting.executeScript({
      target: { tabId: activeTab.id, allFrames: true },
      files: ["content.js"],
    });
    return chrome.tabs.sendMessage(activeTab.id, message);
  }
}
