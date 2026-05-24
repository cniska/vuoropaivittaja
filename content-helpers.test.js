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
  const slotA = "Ke\n28.5.\n06:00–14:00";
  const slotB = "Ti\n27.5.\n12:00–20:00";
  const slotC = "La\n31.5.\nUusi\n09:00–15:00";

  assert.equal(snapshotsAreEqual([slotA, slotB], [slotA, slotB]), true);
  assert.equal(snapshotsAreEqual([slotA], [slotC]), false);
  assert.equal(snapshotsAreEqual([slotA], [slotA, slotB]), false);
  assert.equal(snapshotsAreEqual(null, [slotA]), false);
  assert.equal(snapshotsAreEqual([slotA], undefined), false);
});
