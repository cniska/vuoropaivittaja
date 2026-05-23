const test = require("node:test");
const assert = require("node:assert/strict");

const {
  shouldStartMonitoring,
  snapshotsAreEqual,
} = require("./content-helpers.js");

test("shouldStartMonitoring accepts only fully eligible states", () => {
  const settings = { enabled: true };
  const rule = { selector: "button" };

  assert.equal(shouldStartMonitoring(settings, rule, true, true), true);
  assert.equal(shouldStartMonitoring(settings, rule, false, true), false);
  assert.equal(shouldStartMonitoring(settings, null, true, true), false);
  assert.equal(
    shouldStartMonitoring({ enabled: false }, rule, true, true),
    false
  );
  assert.equal(shouldStartMonitoring(settings, rule, true, false), false);
});

test("snapshotsAreEqual compares ordered list snapshots", () => {
  assert.equal(snapshotsAreEqual(["08:00", "08:30"], ["08:00", "08:30"]), true);
  assert.equal(snapshotsAreEqual(["08:00"], ["08:30"]), false);
  assert.equal(snapshotsAreEqual(["08:00"], ["08:00", "08:30"]), false);
  assert.equal(snapshotsAreEqual(null, ["08:00"]), false);
  assert.equal(snapshotsAreEqual(["08:00"], undefined), false);
});
