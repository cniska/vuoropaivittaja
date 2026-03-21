if (!globalThis.__autoClickerLoaded) {
  globalThis.__autoClickerLoaded = true;

  const STORAGE_KEY = "rules";
  const PICK_RESULT_KEY = "lastPickedElement";
  const DEFAULT_INTERVAL_MS = 300000;
  const MIN_INTERVAL_MS = 500;

  const activeTimers = new Map();
  let lastUrl = location.href;
  let pickerState = null;

  void initialize();

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes[STORAGE_KEY]) {
      applyRules(normalizeRules(changes[STORAGE_KEY].newValue));
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "start-picker") {
      startPicker();
      sendResponse({
        ok: true,
        message: "Click the target element on the page. Press Escape to cancel."
      });
      return false;
    }

    if (message?.type === "test-rule") {
      const normalizedRule = normalizeRules([{ ...message.rule, id: "preview", enabled: true }])[0];
      if (!normalizedRule) {
        sendResponse({ ok: false, error: "Please enter a valid URL pattern and selector first." });
        return false;
      }

      if (!urlMatches(normalizedRule.urlPattern, location.href)) {
        sendResponse({ ok: false, error: "The current tab URL does not match this rule." });
        return false;
      }

      const result = clickSelectorInPage(normalizedRule.selector);
      sendResponse(
        result.clicked
          ? { ok: true, message: "Clicked the matching element." }
          : { ok: false, error: result.message }
      );
      return false;
    }

    return false;
  });

  window.addEventListener("hashchange", handleUrlMaybeChanged);
  window.addEventListener("popstate", handleUrlMaybeChanged);
  document.addEventListener("visibilitychange", handleVisibilityChanged);

  patchHistoryMethod("pushState");
  patchHistoryMethod("replaceState");

  async function initialize() {
    const stored = await chrome.storage.local.get({ [STORAGE_KEY]: [] });
    applyRules(normalizeRules(stored[STORAGE_KEY]));
  }

  function patchHistoryMethod(methodName) {
  const original = history[methodName];
  if (typeof original !== "function") {
    return;
  }

  history[methodName] = function patchedHistoryMethod(...args) {
    const result = original.apply(this, args);
    handleUrlMaybeChanged();
    return result;
  };
  }

  function handleUrlMaybeChanged() {
  if (location.href === lastUrl) {
    return;
  }

  lastUrl = location.href;
  void initialize();
  }

  function handleVisibilityChanged() {
  if (document.visibilityState === "visible") {
    void initialize();
  }
  }

  function applyRules(rules) {
  const matchingRules = rules.filter(
    (rule) => rule.enabled && urlMatches(rule.urlPattern, location.href)
  );
  const nextIds = new Set(matchingRules.map((rule) => rule.id));

  for (const [ruleId, timerId] of activeTimers.entries()) {
    if (!nextIds.has(ruleId)) {
      clearInterval(timerId);
      activeTimers.delete(ruleId);
    }
  }

  for (const rule of matchingRules) {
    const existingTimer = activeTimers.get(rule.id);
    if (existingTimer) {
      clearInterval(existingTimer);
      activeTimers.delete(rule.id);
    }

    const timerId = window.setInterval(() => {
      void runRule(rule);
    }, rule.intervalMs);

    activeTimers.set(rule.id, timerId);
  }
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
      activateTab: Boolean(rule.activateTab),
      intervalMs: clampIntervalMs(rule.intervalMs, rule.intervalMinutes),
      enabled: Boolean(rule.enabled)
    }))
    .filter((rule) => rule.id && rule.urlPattern && rule.selector);
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

  function urlMatches(pattern, url) {
  return url.toLowerCase().includes(pattern.toLowerCase());
  }

  async function runRule(rule) {
  if (document.visibilityState !== "visible") {
    return;
  }

  if (rule.activateTab) {
    const activated = await requestTabActivation();
    if (!activated) {
      return;
    }

    await delay(120);
  }

  clickSelectorInPage(rule.selector);
  }

  function startPicker() {
  stopPicker();

  const overlay = document.createElement("div");
  overlay.dataset.autoClickerOverlay = "true";
  overlay.style.position = "fixed";
  overlay.style.left = "0";
  overlay.style.top = "0";
  overlay.style.width = "0";
  overlay.style.height = "0";
  overlay.style.pointerEvents = "none";
  overlay.style.zIndex = "2147483646";
  overlay.style.border = "2px solid #a6461d";
  overlay.style.borderRadius = "8px";
  overlay.style.background = "rgba(166, 70, 29, 0.14)";
  overlay.style.boxShadow = "0 0 0 9999px rgba(39, 25, 10, 0.12)";

  const hint = document.createElement("div");
  hint.dataset.autoClickerOverlay = "true";
  hint.textContent = "Auto Clicker: click the target element, or press Escape to cancel";
  hint.style.position = "fixed";
  hint.style.top = "16px";
  hint.style.right = "16px";
  hint.style.zIndex = "2147483647";
  hint.style.padding = "10px 14px";
  hint.style.borderRadius = "999px";
  hint.style.background = "#2b2418";
  hint.style.color = "#fff";
  hint.style.font = '600 13px/1.2 "Segoe UI", sans-serif';
  hint.style.pointerEvents = "none";
  hint.style.boxShadow = "0 10px 24px rgba(0, 0, 0, 0.24)";

  document.documentElement.appendChild(overlay);
  document.documentElement.appendChild(hint);

  const handlePointerMove = (event) => {
    const target = getSelectableElement(event);
    updateOverlay(overlay, target);
  };

  const handleClick = async (event) => {
    const target = getSelectableElement(event);
    if (!target) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const selector = buildSelectorForElement(target);
    await chrome.storage.local.set({
      [PICK_RESULT_KEY]: {
        selector,
        url: location.href,
        timestamp: Date.now()
      }
    });
    stopPicker();
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      stopPicker();
    }
  };

  const handlePointerDown = (event) => {
    const target = getSelectableElement(event);
    if (target) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  };

  document.addEventListener("pointermove", handlePointerMove, true);
  document.addEventListener("pointerdown", handlePointerDown, true);
  document.addEventListener("click", handleClick, true);
  document.addEventListener("keydown", handleKeyDown, true);

  pickerState = {
    overlay,
    hint,
    cleanup() {
      document.removeEventListener("pointermove", handlePointerMove, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      overlay.remove();
      hint.remove();
    }
  };
  }

  function stopPicker() {
  if (!pickerState) {
    return;
  }

  pickerState.cleanup();
  pickerState = null;
  }

  function getSelectableElement(event) {
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  for (const item of path) {
    if (item instanceof Element && !item.closest("[data-auto-clicker-overlay='true']")) {
      return findPreferredTarget(item);
    }
  }

  return event.target instanceof Element ? findPreferredTarget(event.target) : null;
  }

  function updateOverlay(overlay, target) {
  if (!target) {
    overlay.style.width = "0";
    overlay.style.height = "0";
    return;
  }

  const rect = target.getBoundingClientRect();
  overlay.style.left = `${rect.left}px`;
  overlay.style.top = `${rect.top}px`;
  overlay.style.width = `${rect.width}px`;
  overlay.style.height = `${rect.height}px`;
  }

  function findPreferredTarget(element) {
  return (
    element.closest('button, input[type="button"], input[type="submit"], input[type="reset"], [role="button"]')
      || null
  );
  }

  function buildSelectorForElement(element) {
  const candidates = buildSelectorCandidates(element);
  for (const candidate of candidates) {
    if (isUniqueSelector(candidate, element)) {
      return candidate;
    }
  }

  return buildXPathSelector(element);
  }

  function buildSelectorCandidates(element) {
  const candidates = [];
  const directSelectors = buildDirectSelectors(element);

  for (const selector of directSelectors) {
    pushCandidate(candidates, selector);
  }

  const ancestorSelectors = getAncestorSelectors(element);
  for (const ancestorSelector of ancestorSelectors) {
    for (const selector of directSelectors) {
      pushCandidate(candidates, `${ancestorSelector} ${selector}`);
    }
  }

  const pathCandidates = buildPathCandidates(element);
  for (const selector of pathCandidates) {
    pushCandidate(candidates, selector);
  }

  return candidates;
  }

  function buildDirectSelectors(element) {
  const tagName = element.localName;
  const selectors = [];

  if (element.id && isStableIdentifier(element.id)) {
    selectors.push(`#${CSS.escape(element.id)}`);
  }

  for (const attribute of preferredAttributes()) {
    const value = element.getAttribute(attribute);
    if (value) {
      selectors.push(`${tagName}[${attribute}="${escapeAttributeValue(value)}"]`);
    }
  }

  const classNames = getStableClassNames(element);
  if (classNames.length) {
    selectors.push(`${tagName}.${classNames[0] ? CSS.escape(classNames[0]) : ""}`);
    selectors.push(`${tagName}.${classNames.map((name) => CSS.escape(name)).join(".")}`);
  }

  selectors.push(tagName);
  return selectors.filter(Boolean);
  }

  function getAncestorSelectors(element) {
  const selectors = [];
  let current = element.parentElement;
  let depth = 0;

  while (current && depth < 3) {
    const selector = buildAncestorSelector(current);
    if (selector) {
      selectors.push(selector);
    }

    current = current.parentElement;
    depth += 1;
  }

  return selectors;
  }

  function buildAncestorSelector(element) {
  if (element.id && isStableIdentifier(element.id)) {
    return `#${CSS.escape(element.id)}`;
  }

  const tagName = element.localName;
  const parts = [tagName];

  for (const attribute of preferredAttributes()) {
    const value = element.getAttribute(attribute);
    if (value) {
      parts.push(`[${attribute}="${escapeAttributeValue(value)}"]`);
      break;
    }
  }

  if (parts.length === 1) {
    const stableClass = getStableClassNames(element)[0];
    if (stableClass) {
      parts.push(`.${CSS.escape(stableClass)}`);
    }
  }

  return parts.length > 1 ? parts.join("") : null;
  }

  function buildPathCandidates(element) {
  const selectors = [];
  const segments = [];
  let current = element;

  while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.documentElement) {
    segments.unshift(buildPathSegment(current));
    selectors.push(segments.join(" > "));
    current = current.parentElement;
  }

  return selectors.reverse();
  }

  function buildPathSegment(element) {
  if (element.id && isStableIdentifier(element.id)) {
    return `#${CSS.escape(element.id)}`;
  }

  const tagName = element.localName;
  const parts = [tagName];

  for (const attribute of preferredAttributes()) {
    const value = element.getAttribute(attribute);
    if (value) {
      parts.push(`[${attribute}="${escapeAttributeValue(value)}"]`);
      break;
    }
  }

  if (parts.length === 1) {
    const stableClass = getStableClassNames(element)[0];
    if (stableClass) {
      parts.push(`.${CSS.escape(stableClass)}`);
    }
  }

  const parent = element.parentElement;
  if (parent) {
    const sameTagSiblings = Array.from(parent.children).filter(
      (child) => child.localName === element.localName
    );
    if (sameTagSiblings.length > 1) {
      parts.push(`:nth-of-type(${sameTagSiblings.indexOf(element) + 1})`);
    }
  }

  return parts.join("");
  }

  function buildXPathSelector(element) {
  const tagName = element.localName;

  for (const attribute of preferredAttributes()) {
    const value = element.getAttribute(attribute);
    if (!value) {
      continue;
    }

    const baseXPath = `//${tagName}[@${attribute}=${toXPathLiteral(value)}]`;
    const indexedXPath = buildIndexedXPath(baseXPath, element);
    if (indexedXPath) {
      return indexedXPath;
    }
  }

  const stableClass = getStableClassNames(element)[0];
  if (stableClass) {
    const baseXPath =
      `//${tagName}[contains(concat(' ', normalize-space(@class), ' '), ${toXPathLiteral(` ${stableClass} `)})]`;
    const indexedXPath = buildIndexedXPath(baseXPath, element);
    if (indexedXPath) {
      return indexedXPath;
    }
  }

  return buildAbsoluteXPath(element);
  }

  function buildIndexedXPath(baseXPath, element) {
  try {
    const result = document.evaluate(
      baseXPath,
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );

    for (let index = 0; index < result.snapshotLength; index += 1) {
      if (result.snapshotItem(index) === element) {
        return result.snapshotLength === 1 ? baseXPath : `(${baseXPath})[${index + 1}]`;
      }
    }
  } catch {
    return null;
  }

  return null;
  }

  function buildAbsoluteXPath(element) {
  const segments = [];
  let current = element;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const tagName = current.localName;
    const parent = current.parentElement;
    const siblings = parent
      ? Array.from(parent.children).filter((child) => child.localName === tagName)
      : [];
    const index = siblings.length > 1 ? `[${siblings.indexOf(current) + 1}]` : "";
    segments.unshift(`${tagName}${index}`);
    current = parent;
  }

  return `/${segments.join("/")}`;
  }

  function isUniqueSelector(selector, expectedElement) {
  if (!selector) {
    return false;
  }

  try {
    const matches = document.querySelectorAll(selector);
    return matches.length === 1 && matches[0] === expectedElement;
  } catch {
    return false;
  }
  }

  function preferredAttributes() {
  return [
    "data-testid",
    "data-test",
    "data-automation-id",
    "aria-label",
    "name",
    "title",
    "type",
    "role"
  ];
  }

  function getStableClassNames(element) {
  return Array.from(element.classList).filter((className) =>
    /^[a-z][a-z0-9_-]{1,30}$/i.test(className) &&
    !/\d{3,}/.test(className) &&
    !/^f[a-z0-9]+$/i.test(className) &&
    !/^_{2,}/.test(className) &&
    !/buttoncanvas/i.test(className)
  );
  }

  function escapeAttributeValue(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function isStableIdentifier(value) {
  return !/\s/.test(value) &&
    !/\d{3,}/.test(value) &&
    !/^f[a-z0-9]+$/i.test(value) &&
    !/buttoncanvas/i.test(value);
  }

  function pushCandidate(candidates, selector) {
  if (!selector || candidates.includes(selector)) {
    return;
  }

  candidates.push(selector);
  }

  function toXPathLiteral(value) {
  if (!value.includes("'")) {
    return `'${value}'`;
  }

  if (!value.includes('"')) {
    return `"${value}"`;
  }

  return `concat('${value.split("'").join(`', "'", '`)}')`;
  }

  function clickSelectorInPage(selector) {
  if (looksLikeXPath(selector)) {
    const xpathElement = queryXPath(selector);
    if (!xpathElement) {
      return {
        clicked: false,
        message: "XPath did not match any element on the page."
      };
    }

    triggerElementInteraction(xpathElement);
    return {
      clicked: true,
      message: "Clicked the matching XPath element."
    };
  }

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
      triggerElementInteraction(element);
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

  function looksLikeXPath(selector) {
  const trimmed = selector.trim();
  return trimmed.startsWith("/") || trimmed.startsWith("(") || trimmed.startsWith("./");
  }

  function queryXPath(selector) {
  try {
    const result = document.evaluate(
      selector,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    return result.singleNodeValue instanceof Element ? result.singleNodeValue : null;
  } catch {
    return null;
  }
  }

  function triggerElementInteraction(element) {
    element.scrollIntoView({
      block: "center",
      inline: "center",
      behavior: "instant"
    });

    if (typeof element.focus === "function") {
      element.focus({ preventScroll: true });
    }

    const rect = element.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;
    const baseOptions = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      button: 0,
      buttons: 1,
      clientX,
      clientY
    };

    dispatchIfSupported(element, "pointerover", PointerEvent, {
      ...baseOptions,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true
    });
    dispatchIfSupported(element, "mouseover", MouseEvent, baseOptions);
    dispatchIfSupported(element, "pointerdown", PointerEvent, {
      ...baseOptions,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true
    });
    dispatchIfSupported(element, "mousedown", MouseEvent, baseOptions);
    dispatchIfSupported(element, "pointerup", PointerEvent, {
      ...baseOptions,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true
    });
    dispatchIfSupported(element, "mouseup", MouseEvent, baseOptions);
    dispatchIfSupported(element, "click", MouseEvent, baseOptions);

    if (typeof element.click === "function") {
      element.click();
    }
  }

  function dispatchIfSupported(element, type, EventType, options) {
    if (typeof EventType !== "function") {
      return;
    }

    element.dispatchEvent(new EventType(type, options));
  }

  async function requestTabActivation() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "activate-sender-tab" });
    return Boolean(response?.ok);
  } catch {
    return false;
  }
  }

  function delay(durationMs) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
  }
}
