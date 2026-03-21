const STORAGE_KEY = "rules";
const PICK_RESULT_KEY = "lastPickedElement";
const DEFAULT_INTERVAL_MS = 300000;
const MIN_INTERVAL_MS = 500;

const form = document.getElementById("rule-form");
const ruleIdInput = document.getElementById("rule-id");
const nameInput = document.getElementById("name");
const urlPatternInput = document.getElementById("url-pattern");
const selectorInput = document.getElementById("selector");
const intervalInput = document.getElementById("interval");
const enabledInput = document.getElementById("enabled");
const pickElementButton = document.getElementById("pick-element");
const statusElement = document.getElementById("status");
const currentSiteElement = document.getElementById("current-site");
const useCurrentSiteButton = document.getElementById("use-current-site");
const resetFormButton = document.getElementById("reset-form");
const testRuleButton = document.getElementById("test-rule");
const rulesList = document.getElementById("rules-list");
const emptyState = document.getElementById("empty-state");
const ruleItemTemplate = document.getElementById("rule-item-template");

let activeTab = null;
let rules = [];

void initialize();

async function initialize() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab || null;

  currentSiteElement.textContent = activeTab?.url
    ? `Current tab: ${activeTab.url}`
    : "Open the site you want to automate, then reopen this popup.";

  const stored = await chrome.storage.local.get({ [STORAGE_KEY]: [] });
  rules = normalizeRules(stored[STORAGE_KEY]);
  renderRules();

  if (!urlPatternInput.value && activeTab?.url) {
    urlPatternInput.value = defaultPatternFor(activeTab.url);
  }

  await loadPickedElement();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const trimmedPattern = urlPatternInput.value.trim();
  const trimmedSelector = selectorInput.value.trim();
  if (!trimmedPattern || !trimmedSelector) {
    setStatus("URL pattern and selector are required.", true);
    return;
  }

  const intervalMs = clampIntervalMs(intervalInput.value);
  const id = ruleIdInput.value || crypto.randomUUID();
  const nextRule = {
    id,
    name: nameInput.value.trim(),
    urlPattern: trimmedPattern,
    selector: trimmedSelector,
    intervalMs,
    enabled: enabledInput.checked
  };

  const existingIndex = rules.findIndex((rule) => rule.id === id);
  if (existingIndex >= 0) {
    rules.splice(existingIndex, 1, nextRule);
    setStatus("Rule updated.");
  } else {
    rules.unshift(nextRule);
    setStatus("Rule saved.");
  }

  await persistRules();
  clearForm();
  renderRules();
});

useCurrentSiteButton.addEventListener("click", () => {
  if (!activeTab?.url) {
    setStatus("No current tab URL found.", true);
    return;
  }

  urlPatternInput.value = defaultPatternFor(activeTab.url);
  setStatus("Filled in the current site.");
});

resetFormButton.addEventListener("click", () => {
  clearForm();
  setStatus("Form cleared.");
});

testRuleButton.addEventListener("click", async () => {
  if (!activeTab?.id) {
    setStatus("Open the target site in a browser tab first.", true);
    return;
  }

  const rule = {
    urlPattern: urlPatternInput.value.trim(),
    selector: selectorInput.value.trim(),
    intervalMs: clampIntervalMs(intervalInput.value),
    enabled: enabledInput.checked
  };

  try {
    const response = await sendToActiveTab({
      type: "test-rule",
      rule
    });
    setStatus(response?.ok ? response.message : response?.error || "Test failed.", !response?.ok);
  } catch {
    setStatus("Could not contact the page. Refresh it once and try again.", true);
  }
});

pickElementButton.addEventListener("click", async () => {
  if (!activeTab?.id) {
    setStatus("Open the target site in a browser tab first.", true);
    return;
  }

  try {
    const response = await sendToActiveTab({ type: "start-picker" });
    setStatus(
      response?.message || "Click the target element on the page, then reopen this popup.",
      !response?.ok
    );
    window.close();
  } catch {
    setStatus("Could not start picker. Refresh the page once and try again.", true);
  }
});

function renderRules() {
  rulesList.textContent = "";
  emptyState.hidden = rules.length > 0;

  for (const rule of rules) {
    const fragment = ruleItemTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".rule-card");
    const title = fragment.querySelector(".rule-title");
    const url = fragment.querySelector(".rule-url");
    const selector = fragment.querySelector(".rule-selector");
    const interval = fragment.querySelector(".rule-interval");
    const badge = fragment.querySelector(".rule-badge");
    const editButton = fragment.querySelector(".edit-rule");
    const testButton = fragment.querySelector(".test-existing-rule");
    const deleteButton = fragment.querySelector(".delete-rule");

    title.textContent = rule.name || "Unnamed rule";
    url.textContent = `URL contains: ${rule.urlPattern}`;
    selector.textContent = `Selector: ${rule.selector}`;
    interval.textContent = `Every ${formatInterval(rule.intervalMs)}`;
    badge.textContent = rule.enabled ? "Enabled" : "Disabled";
    badge.dataset.state = rule.enabled ? "enabled" : "disabled";

    editButton.addEventListener("click", () => {
      populateForm(rule);
      setStatus("Loaded rule into the form.");
    });

    testButton.addEventListener("click", async () => {
      if (!activeTab?.id) {
        setStatus("Open the target site in a browser tab first.", true);
        return;
      }

      try {
        const response = await sendToActiveTab({
          type: "test-rule",
          rule
        });
        setStatus(response?.ok ? response.message : response?.error || "Test failed.", !response?.ok);
      } catch {
        setStatus("Could not contact the page. Refresh it once and try again.", true);
      }
    });

    deleteButton.addEventListener("click", async () => {
      rules = rules.filter((entry) => entry.id !== rule.id);
      await persistRules();
      renderRules();
      if (ruleIdInput.value === rule.id) {
        clearForm();
      }
      setStatus("Rule deleted.");
    });

    card.dataset.ruleId = rule.id;
    rulesList.appendChild(fragment);
  }
}

function populateForm(rule) {
  ruleIdInput.value = rule.id;
  nameInput.value = rule.name || "";
  urlPatternInput.value = rule.urlPattern;
  selectorInput.value = rule.selector;
  intervalInput.value = String(rule.intervalMs);
  enabledInput.checked = rule.enabled;
}

function clearForm() {
  ruleIdInput.value = "";
  nameInput.value = "";
  selectorInput.value = "";
  intervalInput.value = String(DEFAULT_INTERVAL_MS);
  enabledInput.checked = true;
  urlPatternInput.value = activeTab?.url ? defaultPatternFor(activeTab.url) : "";
}

function setStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.style.color = isError ? "#9f2d1f" : "#1f6f43";
}

async function persistRules() {
  rules = normalizeRules(rules);
  await chrome.storage.local.set({ [STORAGE_KEY]: rules });
}

function normalizeRules(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((rule) => rule && typeof rule === "object")
    .map((rule) => ({
      id: String(rule.id || crypto.randomUUID()),
      name: String(rule.name || "").trim(),
      urlPattern: String(rule.urlPattern || "").trim(),
      selector: String(rule.selector || "").trim(),
      intervalMs: clampIntervalMs(rule.intervalMs, rule.intervalMinutes),
      enabled: Boolean(rule.enabled)
    }))
    .filter((rule) => rule.urlPattern && rule.selector);
}

function clampIntervalMs(intervalMs, legacyIntervalMinutes) {
  const directValue = Number(intervalMs);
  if (Number.isFinite(directValue)) {
    return Math.max(MIN_INTERVAL_MS, directValue);
  }

  const legacyMinutes = Number(legacyIntervalMinutes);
  if (Number.isFinite(legacyMinutes)) {
    return Math.max(MIN_INTERVAL_MS, legacyMinutes * 60 * 1000);
  }

  return DEFAULT_INTERVAL_MS;
}

function formatInterval(intervalMs) {
  if (intervalMs < 1000) {
    return `${intervalMs} ms`;
  }

  const seconds = intervalMs / 1000;
  if (seconds < 60) {
    return `${trimNumber(seconds)} second${seconds === 1 ? "" : "s"}`;
  }

  const minutes = seconds / 60;
  return `${trimNumber(minutes)} minute${minutes === 1 ? "" : "s"}`;
}

function trimNumber(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

function defaultPatternFor(url) {
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return url;
  }
}

async function loadPickedElement() {
  const stored = await chrome.storage.local.get({ [PICK_RESULT_KEY]: null });
  const picked = stored[PICK_RESULT_KEY];
  if (!picked || typeof picked.selector !== "string") {
    return;
  }

  selectorInput.value = picked.selector;
  if (!urlPatternInput.value && activeTab?.url) {
    urlPatternInput.value = defaultPatternFor(activeTab.url);
  }

  await chrome.storage.local.remove(PICK_RESULT_KEY);
  setStatus(`Filled selector from page pick: ${picked.selector}`);
}

async function sendToActiveTab(message) {
  if (!activeTab?.id) {
    throw new Error("No active tab");
  }

  try {
    return await chrome.tabs.sendMessage(activeTab.id, message);
  } catch (error) {
    const errorMessage = error?.message || "";
    if (!errorMessage.includes("Receiving end does not exist")) {
      throw error;
    }

    await chrome.scripting.executeScript({
      target: { tabId: activeTab.id, allFrames: true },
      files: ["content.js"]
    });

    return chrome.tabs.sendMessage(activeTab.id, message);
  }
}
