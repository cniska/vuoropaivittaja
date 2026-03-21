const STORAGE_KEY = "rules";

const form = document.getElementById("rule-form");
const ruleIdInput = document.getElementById("rule-id");
const nameInput = document.getElementById("name");
const urlPatternInput = document.getElementById("url-pattern");
const selectorInput = document.getElementById("selector");
const intervalInput = document.getElementById("interval");
const enabledInput = document.getElementById("enabled");
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
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const trimmedPattern = urlPatternInput.value.trim();
  const trimmedSelector = selectorInput.value.trim();
  if (!trimmedPattern || !trimmedSelector) {
    setStatus("URL pattern and selector are required.", true);
    return;
  }

  const intervalMinutes = Math.max(1, Number(intervalInput.value) || 5);
  const id = ruleIdInput.value || crypto.randomUUID();
  const nextRule = {
    id,
    name: nameInput.value.trim(),
    urlPattern: trimmedPattern,
    selector: trimmedSelector,
    intervalMinutes,
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
    intervalMinutes: Number(intervalInput.value) || 5,
    enabled: enabledInput.checked
  };

  const response = await chrome.runtime.sendMessage({
    type: "test-rule",
    rule,
    tabId: activeTab.id
  });

  setStatus(response?.ok ? response.message : response?.error || "Test failed.", !response?.ok);
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
    interval.textContent = `Every ${rule.intervalMinutes} minute${rule.intervalMinutes === 1 ? "" : "s"}`;
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

      const response = await chrome.runtime.sendMessage({
        type: "test-rule",
        rule,
        tabId: activeTab.id
      });

      setStatus(response?.ok ? response.message : response?.error || "Test failed.", !response?.ok);
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
  intervalInput.value = String(rule.intervalMinutes);
  enabledInput.checked = rule.enabled;
}

function clearForm() {
  ruleIdInput.value = "";
  nameInput.value = "";
  selectorInput.value = "";
  intervalInput.value = "5";
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
      intervalMinutes: Math.max(1, Number(rule.intervalMinutes) || 5),
      enabled: Boolean(rule.enabled)
    }))
    .filter((rule) => rule.urlPattern && rule.selector);
}

function defaultPatternFor(url) {
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return url;
  }
}
