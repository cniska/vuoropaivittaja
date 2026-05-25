const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeSettings,
  normalizeRule,
  shouldMonitorTab,
  buildChangeAlertMessage,
  mergeSlotHistory,
  normalizeSlotHistoryMap,
  urlMatches,
  looksLikeXPath,
  isStableIdentifier,
  parseSlotDate,
} = require("./shared.js");

// normalizeSettings

test("normalizeSettings returns defaults for empty input", () => {
  const s = normalizeSettings({});
  assert.equal(s.enabled, false);
  assert.equal(s.notifications, true);
  assert.equal(s.sound, true);
  assert.equal(s.minIntervalMs, 30000);
  assert.equal(s.maxIntervalMs, 90000);
});

test("normalizeSettings returns defaults for null input", () => {
  const s = normalizeSettings(null);
  assert.equal(s.enabled, false);
  assert.equal(s.notifications, true);
  assert.equal(s.sound, true);
});

test("normalizeSettings respects enabled flag", () => {
  assert.equal(normalizeSettings({ enabled: true }).enabled, true);
  assert.equal(normalizeSettings({ enabled: false }).enabled, false);
});

test("normalizeSettings respects notifications and sound flags", () => {
  const s = normalizeSettings({ notifications: false, sound: false });
  assert.equal(s.notifications, false);
  assert.equal(s.sound, false);
});

test("normalizeSettings respects debugLogging flag", () => {
  assert.equal(normalizeSettings({ debugLogging: true }).debugLogging, true);
  assert.equal(normalizeSettings({ debugLogging: false }).debugLogging, false);
});

test("normalizeSettings clamps minIntervalMs to 5000", () => {
  assert.equal(normalizeSettings({ minIntervalMs: 500 }).minIntervalMs, 5000);
  assert.equal(normalizeSettings({ minIntervalMs: 2000 }).minIntervalMs, 5000);
  assert.equal(normalizeSettings({ minIntervalMs: 5000 }).minIntervalMs, 5000);
  assert.equal(normalizeSettings({ minIntervalMs: 10000 }).minIntervalMs, 10000);
});

test("normalizeSettings clamps maxIntervalMs to minIntervalMs when max < min", () => {
  const s = normalizeSettings({ minIntervalMs: 10000, maxIntervalMs: 5000 });
  assert.equal(s.minIntervalMs, 10000);
  assert.equal(s.maxIntervalMs, 10000);
});

test("normalizeSettings accepts valid min and max", () => {
  const s = normalizeSettings({ minIntervalMs: 10000, maxIntervalMs: 60000 });
  assert.equal(s.minIntervalMs, 10000);
  assert.equal(s.maxIntervalMs, 60000);
});

// normalizeRule

test("normalizeRule returns null when urlPattern is empty", () => {
  assert.equal(normalizeRule({ urlPattern: "", selector: "button" }), null);
});

test("normalizeRule returns null when selector is empty", () => {
  assert.equal(
    normalizeRule({ urlPattern: "apps.powerapps.com", selector: "" }),
    null
  );
});

test("normalizeRule returns null for non-object input", () => {
  assert.equal(normalizeRule(null), null);
  assert.equal(normalizeRule(undefined), null);
  assert.equal(normalizeRule("string"), null);
});

test("normalizeRule trims whitespace from all string fields", () => {
  const rule = normalizeRule({
    urlPattern: " apps.powerapps.com ",
    selector: " (//button[@aria-label='Päivitä luettelo'])[2] ",
    listSelector: " div.gallery ",
  });

  assert.equal(rule.urlPattern, "apps.powerapps.com");
  assert.equal(rule.selector, "(//button[@aria-label='Päivitä luettelo'])[2]");
  assert.equal(rule.listSelector, "div.gallery");
});

test("normalizeRule defaults listSelector to empty string", () => {
  const rule = normalizeRule({
    urlPattern: "apps.powerapps.com",
    selector: "button",
  });

  assert.equal(rule.listSelector, "");
});

// shouldMonitorTab

test("shouldMonitorTab requires enabled settings, a valid rule, and a matching tab URL", () => {
  const settings = normalizeSettings({ enabled: true });
  const rule = normalizeRule({
    urlPattern: "https://apps.powerapps.com",
    selector: "button",
  });

  assert.equal(
    shouldMonitorTab(settings, rule, "https://apps.powerapps.com/play/app"),
    true
  );
  assert.equal(
    shouldMonitorTab(
      settings,
      rule,
      "https://content.powerapps.com/iframe/app"
    ),
    false
  );
  assert.equal(
    shouldMonitorTab(
      { ...settings, enabled: false },
      rule,
      "https://apps.powerapps.com/play/app"
    ),
    false
  );
  assert.equal(
    shouldMonitorTab(settings, null, "https://apps.powerapps.com/play/app"),
    false
  );
});

// buildChangeAlertMessage

test("buildChangeAlertMessage preserves independent alert toggles", () => {
  assert.deepEqual(
    buildChangeAlertMessage({
      notifications: true,
      sound: false,
      debugLogging: true,
    }),
    {
      type: "change-detected",
      notifications: true,
      sound: false,
      debugLogging: true,
    }
  );
  assert.deepEqual(
    buildChangeAlertMessage({
      notifications: false,
      sound: true,
      debugLogging: false,
    }),
    {
      type: "change-detected",
      notifications: false,
      sound: true,
      debugLogging: false,
    }
  );
});

test("createLogger emits structured payloads", () => {
  const calls = [];
  const originals = {
    info: console.info,
    warn: console.warn,
    error: console.error,
  };

  console.info = (...args) => calls.push(["info", args]);
  console.warn = (...args) => calls.push(["warn", args]);
  console.error = (...args) => calls.push(["error", args]);

  try {
    const logger = global.VuoropaivittajaShared.createLogger("popup", true);
    logger.debug("Save complete", { event: "save", status: "ok" });
    logger.info("Ready", { event: "ready" });
    logger.warn("Warning", { event: "warning" });
    logger.error("Failure", { event: "failure" });
  } finally {
    console.info = originals.info;
    console.warn = originals.warn;
    console.error = originals.error;
  }

  assert.deepEqual(calls[0], [
    "info",
    [
      "%cVuoropäivittäjä%c popup · Save complete · event=save · status=ok",
      "background:#2563eb;color:#fff;padding:1px 6px;border-radius:7px;font-weight:600;",
      "",
    ],
  ]);
  assert.deepEqual(calls[1], [
    "info",
    [
      "%cVuoropäivittäjä%c popup · Ready · event=ready",
      "background:#2563eb;color:#fff;padding:1px 6px;border-radius:7px;font-weight:600;",
      "",
    ],
  ]);
  assert.deepEqual(calls[2], [
    "warn",
    [
      "%cVuoropäivittäjä%c popup · Warning · event=warning",
      "background:#2563eb;color:#fff;padding:1px 6px;border-radius:7px;font-weight:600;",
      "",
    ],
  ]);
  assert.deepEqual(calls[3], [
    "error",
    [
      "%cVuoropäivittäjä%c popup · Failure · event=failure",
      "background:#2563eb;color:#fff;padding:1px 6px;border-radius:7px;font-weight:600;",
      "",
    ],
  ]);
});

// urlMatches

test("urlMatches compares case-insensitively", () => {
  assert.equal(
    urlMatches("apps.powerapps.com", "https://Apps.PowerApps.com/play"),
    true
  );
  assert.equal(
    urlMatches("example.com", "https://apps.powerapps.com/play"),
    false
  );
});

// looksLikeXPath

test("looksLikeXPath detects common XPath formats", () => {
  assert.equal(
    looksLikeXPath("(//button[@aria-label='Päivitä luettelo'])[2]"),
    true
  );
  assert.equal(looksLikeXPath("//button[@type='button']"), true);
  assert.equal(looksLikeXPath("./div/button"), true);
  assert.equal(looksLikeXPath("button[aria-label='Päivitä luettelo']"), false);
});

// mergeSlotHistory

test("mergeSlotHistory returns empty array for empty inputs", () => {
  assert.deepEqual(mergeSlotHistory([], []), []);
  assert.deepEqual(mergeSlotHistory(null, []), []);
  assert.deepEqual(mergeSlotHistory([], null), []);
});

test("mergeSlotHistory adds new slot lines with firstSeen and lastSeen", () => {
  const slotA = "Ma\n26.5.\n08:00–16:00";
  const slotB = "Ti\n27.5.\n12:00–20:00";
  const result = mergeSlotHistory([], [slotA, slotB]);
  assert.equal(result.length, 2);
  assert.equal(result[0].text, slotA);
  assert.ok(result[0].firstSeen);
  assert.equal(result[0].firstSeen, result[0].lastSeen);
});

test("mergeSlotHistory de-duplicates by text and updates lastSeen", () => {
  const slotA = "Ma\n26.5.\n08:00–16:00";
  const firstSeen = "2026-01-01T00:00:00.000Z";
  const existing = [{ text: slotA, firstSeen, lastSeen: firstSeen }];
  const result = mergeSlotHistory(existing, [slotA]);
  assert.equal(result.length, 1);
  assert.equal(result[0].firstSeen, firstSeen);
  assert.ok(result[0].lastSeen > firstSeen);
});

test("mergeSlotHistory does not add duplicates when same line appears multiple times in newLines", () => {
  const slot = "La\n31.5.\nUusi\n09:00–15:00";
  const result = mergeSlotHistory([], [slot, slot]);
  assert.equal(result.length, 1);
});

test("mergeSlotHistory skips blank lines", () => {
  const slot = "Ke\n28.5.\n06:00–14:00";
  const result = mergeSlotHistory([], [slot, "", "  "]);
  assert.equal(result.length, 1);
});

test("mergeSlotHistory enforces cap by dropping oldest firstSeen entries", () => {
  const shifts = [
    "06:00–14:00",
    "08:00–16:00",
    "12:00–20:00",
    "14:00–22:00",
    "16:00–00:00",
  ];
  const existing = shifts.map((shift, i) => ({
    text: `Ma\n2${i + 1}.5.\n${shift}`,
    firstSeen: `2026-01-0${i + 1}T00:00:00.000Z`,
    lastSeen: `2026-01-0${i + 1}T00:00:00.000Z`,
  }));
  const newSlot = "La\n31.5.\nUusi\n09:00–15:00";
  const result = mergeSlotHistory(existing, [newSlot], 5);
  assert.equal(result.length, 5);
  assert.ok(result.every((e) => e.text !== existing[0].text));
  assert.ok(result.some((e) => e.text === newSlot));
});

test("mergeSlotHistory does not mutate the existing array", () => {
  const slot = "Ma\n26.5.\n08:00–16:00";
  const existing = [
    {
      text: slot,
      firstSeen: "2026-01-01T00:00:00.000Z",
      lastSeen: "2026-01-01T00:00:00.000Z",
    },
  ];
  const original = JSON.stringify(existing);
  mergeSlotHistory(existing, [slot]);
  assert.equal(JSON.stringify(existing), original);
});

// normalizeSlotHistoryMap

test("normalizeSlotHistoryMap returns the object unchanged for a valid map", () => {
  const map = { "https://example.com": [] };
  assert.equal(normalizeSlotHistoryMap(map), map);
});

test("normalizeSlotHistoryMap returns empty object for an array (legacy format)", () => {
  assert.deepEqual(normalizeSlotHistoryMap([{ text: "slot" }]), {});
});

test("normalizeSlotHistoryMap returns empty object for null and primitives", () => {
  assert.deepEqual(normalizeSlotHistoryMap(null), {});
  assert.deepEqual(normalizeSlotHistoryMap(undefined), {});
  assert.deepEqual(normalizeSlotHistoryMap("string"), {});
  assert.deepEqual(normalizeSlotHistoryMap(42), {});
});

// parseSlotDate

test("parseSlotDate returns YYYY-MM-DD when year is present", () => {
  assert.equal(parseSlotDate("Lauantai 22.6.2026 20:00 - 21:00"), "2026-06-22");
  assert.equal(parseSlotDate("Pe 29.5.2026 20:00 - 21:00"), "2026-05-29");
  assert.equal(parseSlotDate("6.6.2026"), "2026-06-06");
});

test("parseSlotDate returns MM-DD when year is absent", () => {
  assert.equal(parseSlotDate("Ke 28.5. 06:00–14:00"), "05-28");
});

test("parseSlotDate returns empty string when no date found", () => {
  assert.equal(parseSlotDate("Ei päivämäärää"), "");
  assert.equal(parseSlotDate(""), "");
});

test("parseSlotDate sorts correctly for ascending date order", () => {
  const dates = [
    "Lauantai 22.6.2026 20:00 - 21:00",
    "Lauantai 30.5.2026 20:00 - 21:00",
    "Perjantai 29.5.2026 20:00 - 21:00",
    "Perjantai 6.6.2026 20:00 - 21:00",
  ];
  const sorted = dates
    .slice()
    .sort((a, b) => parseSlotDate(a).localeCompare(parseSlotDate(b)));
  assert.deepEqual(sorted, [
    "Perjantai 29.5.2026 20:00 - 21:00",
    "Lauantai 30.5.2026 20:00 - 21:00",
    "Perjantai 6.6.2026 20:00 - 21:00",
    "Lauantai 22.6.2026 20:00 - 21:00",
  ]);
});

// isStableIdentifier

test("isStableIdentifier rejects dynamic Power Apps ids", () => {
  assert.equal(
    isStableIdentifier(
      "ButtonCanvas - 327-ButtonCanvas - 327-pcf-container-id"
    ),
    false
  );
  assert.equal(
    isStableIdentifier("ButtonCanvas-312-ButtonCanvas-312-pcf-container-id"),
    false
  );
  assert.equal(isStableIdentifier("refreshButton"), true);
});
