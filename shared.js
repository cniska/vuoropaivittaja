(function initializeVuoropaivittajaShared(globalScope) {
  const DEFAULT_MIN_INTERVAL_MS = 30000;
  const DEFAULT_MAX_INTERVAL_MS = 90000;
  const ABSOLUTE_MIN_INTERVAL_MS = 5000;
  const SLOT_HISTORY_CAP = 500;

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

  function normalizeSlotHistoryMap(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }

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

  function parseSlotDate(text) {
    const match = String(text || "").match(/(\d{1,2})\.(\d{1,2})\.(\d{4})?/);
    if (!match) return "";
    const year = match[3] ?? "";
    const mm = match[2].padStart(2, "0");
    const dd = match[1].padStart(2, "0");
    return year ? `${year}-${mm}-${dd}` : `${mm}-${dd}`;
  }

  const STRINGS = {
    // Toasts
    saved: "Tallennettu.",
    monitoringStarted: "Seuranta käynnistetty.",
    monitoringStopped: "Seuranta pysäytetty.",
    saveFailed: "Tallennus epäonnistui.",
    openTargetFirst: "Avaa kohdesivusto ensin.",
    pickerFailed:
      "Valitsin ei käynnistynyt. Lataa sivu uudelleen ja yritä.",
    enterSelectorFirst: "Syötä valitsin ensin.",
    testing: "Testataan...",
    connectionFailed: "Sivuun ei saatu yhteyttä. Lataa sivu uudelleen ja yritä.",
    elementPicked: "Painike valittu sivulta.",
    monitorClicked: "Painiketta klikattiin.",
    testFailed: "Testi epäonnistui.",
    clearHistoryFailed: "Historian tyhjennys epäonnistui.",

    // Dialogs
    confirmClearHistory: "Tyhjennetäänkö koko vuorohistoria?",

    // UI labels
    noTargetSet: "Ei asetettu",

    // History panel
    historyEmpty: "Ei tallennettuja vuoroja.",
    historyLoadMore: (n) => `Lataa lisää (${n})`,
    historyTotal: (n) => `Yhteensä <strong>${n}</strong> vuoroa`,
    historyLastSeen: (ts) => `Viimeksi nähty ${ts}`,

    // In-page picker & click results
    pickerHint: "Klikkaa haluamaasi painiketta tai paina Esc peruuttaaksesi.",
    clickSuccess: "Painike klikattu onnistuneesti.",
    selectorNotFound: "Valitsinta ei löydetty sivulta.",

    // Desktop notification
    notificationTitle: "Vuoropäivittäjä",
    notificationBody: "Uusia vuoroja saattaa olla saatavilla.",
  };

  async function toggleDebug() {
    if (typeof chrome === "undefined" || !chrome.storage) {
      console.warn("toggleDebug: chrome.storage not available in this context");
      return;
    }
    const stored = await chrome.storage.local.get({ settings: {} });
    const current = Boolean(stored.settings?.debugLogging);
    await chrome.storage.local.set({
      settings: { ...stored.settings, debugLogging: !current },
    });
    console.info(`[Vuoropäivittäjä] Debug logging ${!current ? "enabled" : "disabled"}`);
  }

  const api = {
    normalizeSettings,
    normalizeRule,
    shouldMonitorTab,
    buildChangeAlertMessage,
    mergeSlotHistory,
    normalizeSlotHistoryMap,
    createLogger,
    urlMatches,
    looksLikeXPath,
    isStableIdentifier,
    parseSlotDate,
    STRINGS,
    toggleDebug,
  };

  globalScope.VuoropaivittajaShared = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
