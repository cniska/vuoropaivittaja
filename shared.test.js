const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeSettings,
  normalizeRule,
  shouldMonitorTab,
  buildChangeAlertMessage,
  urlMatches,
  looksLikeXPath,
  isStableIdentifier,
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

test("normalizeSettings clamps minIntervalMs to 2000", () => {
  assert.equal(normalizeSettings({ minIntervalMs: 500 }).minIntervalMs, 2000);
  assert.equal(normalizeSettings({ minIntervalMs: 2000 }).minIntervalMs, 2000);
  assert.equal(normalizeSettings({ minIntervalMs: 5000 }).minIntervalMs, 5000);
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
    buildChangeAlertMessage({ notifications: true, sound: false }),
    {
      type: "change-detected",
      notifications: true,
      sound: false,
    }
  );
  assert.deepEqual(
    buildChangeAlertMessage({ notifications: false, sound: true }),
    {
      type: "change-detected",
      notifications: false,
      sound: true,
    }
  );
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
