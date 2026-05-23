(function initializeAutoClickerShared(globalScope) {
  const DEFAULT_INTERVAL_MS = 10000;
  const MIN_INTERVAL_MS = 500;

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
    return String(url || "")
      .toLowerCase()
      .includes(String(pattern || "").toLowerCase());
  }

  function looksLikeXPath(selector) {
    const trimmed = String(selector || "").trim();
    return (
      trimmed.startsWith("/") ||
      trimmed.startsWith("(") ||
      trimmed.startsWith("./")
    );
  }

  function isStableIdentifier(value) {
    const text = String(value || "");
    if (!text) {
      return false;
    }

    return (
      !/\s/.test(text) &&
      !/\d{3,}/.test(text) &&
      !/^f[a-z0-9]+$/i.test(text) &&
      !/^_{2,}/.test(text) &&
      !/buttoncanvas/i.test(text)
    );
  }

  function normalizeRule(rule, options = {}) {
    if (!rule || typeof rule !== "object") {
      return null;
    }

    const requireId = Boolean(options.requireId);
    const createId =
      typeof options.createId === "function" ? options.createId : null;
    const rawId = String(rule.id || "").trim();
    const id = rawId || (!requireId && createId ? String(createId()) : "");

    const normalizedRule = {
      id,
      name: String(rule.name || "").trim(),
      urlPattern: String(rule.urlPattern || "").trim(),
      selector: String(rule.selector || "").trim(),
      targetUrl: String(rule.targetUrl || "").trim(),
      activateTab: Boolean(rule.activateTab),
      intervalMs: clampIntervalMs(rule.intervalMs, rule.intervalMinutes),
      enabled: Boolean(rule.enabled),
    };

    if (!normalizedRule.urlPattern || !normalizedRule.selector) {
      return null;
    }

    if (requireId && !normalizedRule.id) {
      return null;
    }

    return normalizedRule;
  }

  function normalizeRules(value, options = {}) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.map((rule) => normalizeRule(rule, options)).filter(Boolean);
  }

  const api = {
    DEFAULT_INTERVAL_MS,
    MIN_INTERVAL_MS,
    clampIntervalMs,
    urlMatches,
    looksLikeXPath,
    isStableIdentifier,
    normalizeRule,
    normalizeRules,
  };

  globalScope.AutoClickerShared = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
