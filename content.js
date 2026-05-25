if (!globalThis.__vuoropaivittajaLoaded) {
  globalThis.__vuoropaivittajaLoaded = true;

  const {
    normalizeSettings,
    normalizeRule,
    shouldMonitorTab,
    buildChangeAlertMessage,
    createLogger,
    looksLikeXPath,
    isStableIdentifier,
  } = globalThis.VuoropaivittajaShared;
  const { shouldStartMonitoring, snapshotsAreEqual, parseSlotText } =
    globalThis.VuoropaivittajaContentHelpers;

  let lastUrl = location.href;
  let pickerState = null;
  let monitoringSession = 0;
  let debugLoggingEnabled = false;
  const logger = createLogger("content", () => debugLoggingEnabled);

  void initialize();

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && (changes.settings || changes.rule)) {
      void initialize();
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "start-picker") {
      startPicker();
      sendResponse({
        ok: true,
        message: "Klikkaa haluamaasi painiketta tai paina Esc peruuttaaksesi.",
      });
      return false;
    }

    if (message?.type === "stop-picker") {
      stopPicker();
      sendResponse({
        ok: true,
      });
      return false;
    }

    if (message?.type === "snapshot-slots") {
      void (async () => {
        try {
          const stored = await chrome.storage.local.get({ rule: {} });
          const rule = normalizeRule(stored.rule);
          if (rule?.listSelector) {
            const slots = snapshotListItems(rule.listSelector);
            if (slots.length > 0) {
              void chrome.runtime
                .sendMessage({
                  type: "update-slot-history",
                  urlPattern: rule.urlPattern,
                  slots,
                })
                .catch(() => {});
            }
          }
        } catch {}
      })();
      sendResponse({ ok: true });
      return false;
    }

    if (message?.type === "test-rule") {
      const selector = String(message.rule?.selector || "").trim();
      if (!selector) {
        sendResponse({
          ok: false,
          error: "Syötä valitsin ensin.",
        });
        return false;
      }

      const result = clickSelectorInPage(selector);
      if (result.clicked) {
        sendResponse({ ok: true, message: "Painike klikattu onnistuneesti." });
        return false;
      }
      if (isTopFrame()) {
        // Delay lets frames that found the element respond first.
        window.setTimeout(
          () => sendResponse({ ok: false, error: result.message }),
          300
        );
        return true;
      }
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
    try {
      const stored = await chrome.storage.local.get({ settings: {}, rule: {} });
      const settings = normalizeSettings(stored.settings);
      let rule = normalizeRule(stored.rule);
      debugLoggingEnabled = Boolean(settings.debugLogging);
      if (isTopFrame()) {
        logger.info("Content script initialized", {
          event: "initialize",
          enabled: settings.enabled,
          debugLogging: debugLoggingEnabled,
          hasRule: Boolean(rule),
        });
      }

      if (rule && !rule.listSelector) {
        const detected = detectListSelector(rule.selector);
        if (detected) {
          rule = { ...rule, listSelector: detected };
          void chrome.storage.local.set({ rule }).catch(() => {});
        }
      }

      if (rule?.listSelector) {
        const slots = snapshotListItems(rule.listSelector);
        if (slots.length > 0) {
          void chrome.runtime
            .sendMessage({
              type: "update-slot-history",
              urlPattern: rule.urlPattern,
              slots,
            })
            .catch(() => {});
        }
      }

      monitoringSession += 1;
      const session = monitoringSession;

      if (
        shouldStartMonitoring(
          settings,
          rule,
          await shouldMonitorCurrentTab(settings, rule),
          rule && findElementInPage(rule.selector)
        )
      ) {
        void startMonitoring(settings, rule, session).catch((error) => {
          logger.warn("Monitoring loop failed", {
            event: "monitoring-failed",
            message: String(error?.message || error || ""),
          });
        });
      }
    } catch (error) {
      if (isTopFrame()) {
        logger.warn("Content script initialization failed", {
          event: "initialize-failed",
          message: String(error?.message || error || ""),
        });
      }
    }
  }

  async function shouldMonitorCurrentTab(settings, rule) {
    if (!settings.enabled || !rule) {
      return false;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: "should-monitor-tab",
        settings,
        rule,
      });
      return response?.ok ? Boolean(response.shouldMonitor) : true;
    } catch {
      return shouldMonitorTab(settings, rule, location.href);
    }
  }

  async function startMonitoring(settings, rule, session) {
    logger.info("Monitoring loop started", {
      event: "monitoring-started",
      session,
      selector: rule.selector,
      listSelector: rule.listSelector,
    });

    while (monitoringSession === session) {
      await delay(
        randomInterval(settings.minIntervalMs, settings.maxIntervalMs)
      );
      if (monitoringSession !== session) break;

      const before = takeSnapshot(rule.listSelector);
      const clickResult = clickSelectorInPage(rule.selector);
      logger.info("Refresh button processed", {
        event: "monitor-click",
        clicked: clickResult.clicked,
        message: clickResult.message,
        session,
      });
      void chrome.runtime
        .sendMessage({
          type: "monitor-clicked",
          ok: clickResult.clicked,
          message: clickResult.clicked
            ? "Päivitä-painiketta klikattiin."
            : clickResult.message,
        })
        .catch(() => {});

      await delay(1500);
      if (monitoringSession !== session) break;

      const after = takeSnapshot(rule.listSelector);

      if (rule.listSelector) {
        const slots = snapshotListItems(rule.listSelector);
        if (slots.length > 0) {
          void chrome.runtime
            .sendMessage({
              type: "update-slot-history",
              urlPattern: rule.urlPattern,
              slots,
            })
            .catch(() => {});
        }
      }

      if (!snapshotsAreEqual(before, after)) {
        logger.info("Snapshot change detected", {
          event: "change-detected",
          session,
          notifications: settings.notifications,
          sound: settings.sound,
        });
        fireChangeNotification(settings);
      }
    }
  }

  function snapshotListItems(listSelector) {
    const list = document.querySelector(listSelector);
    if (!list) return [];
    const items = Array.from(list.querySelectorAll('[role="listitem"]'));
    return items.map((item) => parseSlotText(item.innerText)).filter(Boolean);
  }

  function detectListSelector(selector) {
    const button = findElementInPage(selector);
    if (!button) return "";

    let ancestor = button.parentElement;
    while (ancestor && ancestor !== document.documentElement) {
      const list = ancestor.querySelector('[role="list"], [role="grid"]');
      if (list && !button.contains(list)) {
        return buildSelectorForElement(list);
      }
      ancestor = ancestor.parentElement;
    }
    return "";
  }

  function findElementInPage(selector) {
    if (looksLikeXPath(selector)) {
      return queryXPath(selector);
    }

    const visited = new Set();
    const queue = [document];
    while (queue.length) {
      const root = queue.shift();
      if (!root || visited.has(root)) continue;
      visited.add(root);
      const el = root.querySelector(selector);
      if (el) return el;
      for (const host of root.querySelectorAll("*")) {
        if (host.shadowRoot) queue.push(host.shadowRoot);
      }
    }
    return null;
  }

  function takeSnapshot(listSelector) {
    if (listSelector) {
      const list = document.querySelector(listSelector);
      if (list) {
        const items = Array.from(list.querySelectorAll('[role="listitem"]'));
        const parsed = items
          .map((item) => parseSlotText(item.innerText))
          .filter(Boolean);
        if (parsed.length > 0) {
          return parsed;
        }
      }
    }
    return [document.body.innerText];
  }

  function randomInterval(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function fireChangeNotification(settings) {
    logger.info("Alert sent to background", {
      event: "alert-dispatched",
      notifications: settings.notifications,
      sound: settings.sound,
    });
    void chrome.runtime.sendMessage(buildChangeAlertMessage(settings));
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

  function startPicker() {
    stopPicker();
    if (isTopFrame()) {
      logger.info("Picker started on page", { event: "picker-started" });
    }

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
    hint.textContent =
      "Klikkaa haluamaasi painiketta tai paina Esc peruuttaaksesi.";
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
    const shouldShowHint = window.top === window;
    if (shouldShowHint) {
      document.documentElement.appendChild(hint);
    }

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
      stopPicker();
      void chrome.runtime.sendMessage({ type: "stop-picker" }).catch(() => {});
      void chrome.runtime
        .sendMessage({ type: "element-picked", selector })
        .catch(() => {});
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        stopPicker();
        void chrome.runtime
          .sendMessage({ type: "stop-picker" })
          .catch(() => {});
      }
    };

    const handlePointerDown = (event) => {
      const target = getSelectableElement(event);
      if (target) {
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
      },
    };
  }

  function stopPicker() {
    if (!pickerState) {
      return;
    }

    pickerState.cleanup();
    pickerState = null;
    if (isTopFrame()) {
      logger.info("Picker closed on page", { event: "picker-closed" });
    }
  }

  function isTopFrame() {
    return window.top === window;
  }

  function getSelectableElement(event) {
    const path =
      typeof event.composedPath === "function" ? event.composedPath() : [];
    for (const item of path) {
      if (
        item instanceof Element &&
        !item.closest("[data-auto-clicker-overlay='true']")
      ) {
        return findPreferredTarget(item);
      }
    }

    return event.target instanceof Element
      ? findPreferredTarget(event.target)
      : null;
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
      element.closest(
        'button, input[type="button"], input[type="submit"], input[type="reset"], [role="button"]'
      ) || null
    );
  }

  function buildSelectorForElement(element) {
    const candidates = buildSelectorCandidates(element);
    for (const candidate of candidates) {
      if (isUniqueSelector(candidate, element)) {
        return candidate;
      }
    }

    const indexedXPath = buildIndexedXPathSelector(element);
    if (indexedXPath) {
      return indexedXPath;
    }

    return buildXPathSelector(element);
  }

  function buildIndexedXPathSelector(element) {
    const tagName = element.localName;

    for (const attribute of preferredAttributes()) {
      const value = element.getAttribute(attribute);
      if (!value) {
        continue;
      }

      const baseXPath = `//${tagName}[@${attribute}=${toXPathLiteral(value)}]`;
      const indexedXPath = buildIndexedXPath(baseXPath, element);
      if (indexedXPath?.startsWith("(")) {
        return indexedXPath;
      }
    }

    const stableClass = getStableClassNames(element)[0];
    if (!stableClass) {
      return null;
    }

    const baseXPath = `//${tagName}[contains(concat(' ', normalize-space(@class), ' '), ${toXPathLiteral(` ${stableClass} `)})]`;
    const indexedXPath = buildIndexedXPath(baseXPath, element);
    return indexedXPath?.startsWith("(") ? indexedXPath : null;
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
        selectors.push(
          `${tagName}[${attribute}="${escapeAttributeValue(value)}"]`
        );
      }
    }

    const classNames = getStableClassNames(element);
    if (classNames.length) {
      selectors.push(
        `${tagName}.${classNames[0] ? CSS.escape(classNames[0]) : ""}`
      );
      selectors.push(
        `${tagName}.${classNames.map((name) => CSS.escape(name)).join(".")}`
      );
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

    while (
      current &&
      current.nodeType === Node.ELEMENT_NODE &&
      current !== document.documentElement
    ) {
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
      const baseXPath = `//${tagName}[contains(concat(' ', normalize-space(@class), ' '), ${toXPathLiteral(` ${stableClass} `)})]`;
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
          return result.snapshotLength === 1
            ? baseXPath
            : `(${baseXPath})[${index + 1}]`;
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
        ? Array.from(parent.children).filter(
            (child) => child.localName === tagName
          )
        : [];
      const index =
        siblings.length > 1 ? `[${siblings.indexOf(current) + 1}]` : "";
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
      "data-control-name",
      "aria-label",
      "name",
      "title",
      "type",
      "role",
    ];
  }

  function getStableClassNames(element) {
    return Array.from(element.classList).filter(
      (className) =>
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
          message: "XPath ei löytänyt yhtään elementtiä sivulta.",
        };
      }

      triggerElementInteraction(xpathElement);
      return {
        clicked: true,
        message: "XPath-elementti klikattu onnistuneesti.",
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
          message: "Painike klikattu onnistuneesti.",
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
      message: "Valitsinta ei löydetty sivulta.",
    };
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
      return result.singleNodeValue instanceof Element
        ? result.singleNodeValue
        : null;
    } catch {
      return null;
    }
  }

  function triggerElementInteraction(element) {
    element.scrollIntoView({
      block: "center",
      inline: "center",
      behavior: "instant",
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
      clientY,
    };

    dispatchIfSupported(element, "pointerover", PointerEvent, {
      ...baseOptions,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    });
    dispatchIfSupported(element, "mouseover", MouseEvent, baseOptions);
    dispatchIfSupported(element, "pointerdown", PointerEvent, {
      ...baseOptions,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    });
    dispatchIfSupported(element, "mousedown", MouseEvent, baseOptions);
    dispatchIfSupported(element, "pointerup", PointerEvent, {
      ...baseOptions,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    });
    dispatchIfSupported(element, "mouseup", MouseEvent, baseOptions);
    dispatchIfSupported(element, "click", MouseEvent, baseOptions);
  }

  function dispatchIfSupported(element, type, EventType, options) {
    if (typeof EventType !== "function") {
      return;
    }

    element.dispatchEvent(new EventType(type, options));
  }

  function delay(durationMs) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, durationMs);
    });
  }
}
