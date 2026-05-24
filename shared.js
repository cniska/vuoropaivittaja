(function initializeVuoropaivittajaShared(globalScope) {
  const DEFAULT_MIN_INTERVAL_MS = 30000;
  const DEFAULT_MAX_INTERVAL_MS = 90000;
  const ABSOLUTE_MIN_INTERVAL_MS = 2000;

  function normalizeSettings(value) {
    const s = value && typeof value === "object" ? value : {};
    const minIntervalMs = Math.max(
      ABSOLUTE_MIN_INTERVAL_MS,
      Number.isFinite(Number(s.minIntervalMs))
        ? Number(s.minIntervalMs)
        : DEFAULT_MIN_INTERVAL_MS
    );
    const rawMax = Number.isFinite(Number(s.maxIntervalMs))
      ? Number(s.maxIntervalMs)
      : DEFAULT_MAX_INTERVAL_MS;
    const maxIntervalMs = Math.max(minIntervalMs, rawMax);

    return {
      enabled: Boolean(s.enabled),
      notifications:
        s.notifications === undefined ? true : Boolean(s.notifications),
      sound: s.sound === undefined ? true : Boolean(s.sound),
      debugLogging: Boolean(s.debugLogging),
      minIntervalMs,
      maxIntervalMs,
    };
  }

  function normalizeRule(value) {
    if (!value || typeof value !== "object") {
      return null;
    }

    const urlPattern = String(value.urlPattern || "").trim();
    const selector = String(value.selector || "").trim();

    if (!urlPattern || !selector) {
      return null;
    }

    return {
      urlPattern,
      selector,
      listSelector: String(value.listSelector || "").trim(),
    };
  }

  function urlMatches(pattern, url) {
    return String(url || "")
      .toLowerCase()
      .includes(String(pattern || "").toLowerCase());
  }

  function shouldMonitorTab(settings, rule, tabUrl) {
    return Boolean(
      settings?.enabled && rule && urlMatches(rule.urlPattern, tabUrl)
    );
  }

  function buildChangeAlertMessage(settings) {
    const normalized = normalizeSettings(settings);
    return {
      type: "change-detected",
      notifications: normalized.notifications,
      sound: normalized.sound,
      debugLogging: normalized.debugLogging,
    };
  }

  function createLogger(namespace, isEnabled) {
    function shouldLog() {
      return typeof isEnabled === "function"
        ? Boolean(isEnabled())
        : Boolean(isEnabled);
    }

    function hasMeta(meta) {
      return meta && typeof meta === "object" && Object.keys(meta).length > 0;
    }

    function formatMeta(meta) {
      return Object.entries(meta)
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(" · ");
    }

    function emit(level, message, meta = {}) {
      const text = String(message || "");
      const write = console[level] || console.info;
      const badgeStyle =
        "background:#2563eb;color:#fff;padding:1px 6px;border-radius:7px;font-weight:600;";
      const metaText = hasMeta(meta) ? ` · ${formatMeta(meta)}` : "";
      write.call(
        console,
        `%cVuoropäivittäjä%c ${namespace} · ${text}${metaText}`,
        badgeStyle,
        ""
      );
    }

    return {
      debug(message, meta = {}) {
        if (shouldLog()) {
          emit("info", message, meta);
        }
      },
      info(message, meta = {}) {
        if (shouldLog()) {
          emit("info", message, meta);
        }
      },
      warn(message, meta = {}) {
        emit("warn", message, meta);
      },
      error(message, meta = {}) {
        emit("error", message, meta);
      },
    };
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

  const SLOT_HISTORY_CAP = 500;

  function mergeSlotHistory(existing, newLines, cap = SLOT_HISTORY_CAP) {
    const base = Array.isArray(existing) ? existing : [];
    if (!Array.isArray(newLines) || newLines.length === 0) return base;

    const now = new Date().toISOString();
    const byText = new Map(base.map((e) => [e.text, { ...e }]));

    for (const line of newLines) {
      const text = String(line || "").trim();
      if (!text) continue;

      if (byText.has(text)) {
        byText.get(text).lastSeen = now;
      } else {
        byText.set(text, { text, firstSeen: now, lastSeen: now });
      }
    }

    let merged = Array.from(byText.values());

    if (merged.length > cap) {
      merged.sort((a, b) => a.firstSeen.localeCompare(b.firstSeen));
      merged = merged.slice(merged.length - cap);
    }

    return merged;
  }

  const api = {
    normalizeSettings,
    normalizeRule,
    shouldMonitorTab,
    buildChangeAlertMessage,
    mergeSlotHistory,
    createLogger,
    urlMatches,
    looksLikeXPath,
    isStableIdentifier,
  };

  globalScope.VuoropaivittajaShared = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
