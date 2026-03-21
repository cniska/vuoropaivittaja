const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_INTERVAL_MS,
  MIN_INTERVAL_MS,
  clampIntervalMs,
  urlMatches,
  looksLikeXPath,
  isStableIdentifier,
  normalizeRule,
  normalizeRules
} = require("./shared.js");

test("clampIntervalMs uses the shared default", () => {
  assert.equal(clampIntervalMs(undefined), DEFAULT_INTERVAL_MS);
});

test("clampIntervalMs enforces the minimum interval", () => {
  assert.equal(clampIntervalMs(100), MIN_INTERVAL_MS);
  assert.equal(clampIntervalMs("400"), MIN_INTERVAL_MS);
});

test("clampIntervalMs still supports legacy minutes", () => {
  assert.equal(clampIntervalMs(undefined, 0.25), 15000);
});

test("urlMatches compares case-insensitively", () => {
  assert.equal(urlMatches("apps.powerapps.com", "https://Apps.PowerApps.com/play"), true);
  assert.equal(urlMatches("example.com", "https://apps.powerapps.com/play"), false);
});

test("looksLikeXPath detects common XPath formats", () => {
  assert.equal(looksLikeXPath("(//button[@aria-label='Päivitä luettelo'])[2]"), true);
  assert.equal(looksLikeXPath("//button[@type='button']"), true);
  assert.equal(looksLikeXPath("./div/button"), true);
  assert.equal(looksLikeXPath("button[aria-label='Päivitä luettelo']"), false);
});

test("isStableIdentifier rejects dynamic Power Apps ids", () => {
  assert.equal(
    isStableIdentifier("ButtonCanvas - 327-ButtonCanvas - 327-pcf-container-id"),
    false
  );
  assert.equal(
    isStableIdentifier("ButtonCanvas-312-ButtonCanvas-312-pcf-container-id"),
    false
  );
  assert.equal(isStableIdentifier("refreshButton"), true);
});

test("normalizeRule trims values and preserves a saved target URL", () => {
  const normalized = normalizeRule({
    id: "rule-1",
    name: " Refresh ",
    urlPattern: " apps.powerapps.com ",
    selector: " (//button[@aria-label='Päivitä luettelo'])[2] ",
    targetUrl: " https://apps.powerapps.com/play/app ",
    intervalMs: 1200,
    activateTab: 1,
    enabled: true
  }, { requireId: true });

  assert.deepEqual(normalized, {
    id: "rule-1",
    name: "Refresh",
    urlPattern: "apps.powerapps.com",
    selector: "(//button[@aria-label='Päivitä luettelo'])[2]",
    targetUrl: "https://apps.powerapps.com/play/app",
    activateTab: true,
    intervalMs: 1200,
    enabled: true
  });
});

test("normalizeRule rejects incomplete rules", () => {
  assert.equal(normalizeRule({ urlPattern: "apps.powerapps.com" }), null);
  assert.equal(normalizeRule({ selector: "button" }), null);
  assert.equal(normalizeRule({ urlPattern: "apps.powerapps.com", selector: "button" }, { requireId: true }), null);
});

test("normalizeRules can create ids for popup-created rules", () => {
  let nextId = 1;
  const rules = normalizeRules([
    { urlPattern: "apps.powerapps.com", selector: "button[aria-label='Päivitä luettelo']" }
  ], {
    createId: () => `generated-${nextId++}`
  });

  assert.equal(rules.length, 1);
  assert.equal(rules[0].id, "generated-1");
  assert.equal(rules[0].intervalMs, DEFAULT_INTERVAL_MS);
});
