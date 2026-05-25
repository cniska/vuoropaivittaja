const test = require("node:test");
const assert = require("node:assert/strict");

const {
  shouldStartMonitoring,
  snapshotsAreEqual,
  parseSlotText,
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

// parseSlotText

test("parseSlotText extracts dow, date, and time from test page format", () => {
  assert.equal(
    parseSlotText("Keskiviikko\n28.5.\n06:00–14:00"),
    "Keskiviikko 28.5. 06:00–14:00"
  );
  assert.equal(
    parseSlotText("Lauantai\n31.5.\n09:00–15:00"),
    "Lauantai 31.5. 09:00–15:00"
  );
});

test("parseSlotText extracts from PowerApps format with noise", () => {
  assert.equal(
    parseSlotText(
      "Item 1. Selected. 6.6.2026 (06) Lauantai 17.00 - 18.00 General Hylkää Varaa"
    ),
    "Lauantai 6.6.2026 17.00 - 18.00"
  );
});

test("parseSlotText handles all Finnish weekday names", () => {
  const days = [
    "Maanantai",
    "Tiistai",
    "Keskiviikko",
    "Torstai",
    "Perjantai",
    "Lauantai",
    "Sunnuntai",
  ];
  for (const day of days) {
    assert.ok(parseSlotText(`${day} 1.6.2026 08:00–16:00`).startsWith(day));
  }
});

test("parseSlotText extracts dow, date, and time without weekday name", () => {
  assert.equal(parseSlotText("1.6. 08:00–16:00"), "1.6. 08:00–16:00");
});

test("parseSlotText returns empty string when no recognisable parts found", () => {
  assert.equal(parseSlotText("Hylkää Varaa General"), "");
  assert.equal(parseSlotText(""), "");
});

test("parseSlotText omits missing parts gracefully", () => {
  assert.equal(
    parseSlotText("6.6.2026 17.00 - 18.00"),
    "6.6.2026 17.00 - 18.00"
  );
  assert.equal(
    parseSlotText("Lauantai 17.00 - 18.00"),
    "Lauantai 17.00 - 18.00"
  );
});

test("snapshotsAreEqual compares ordered list snapshots", () => {
  const slotA = "Keskiviikko\n28.5.\n06:00–14:00";
  const slotB = "Tiistai\n27.5.\n12:00–20:00";
  const slotC = "Lauantai\n31.5.\nUusi\n09:00–15:00";

  assert.equal(snapshotsAreEqual([slotA, slotB], [slotA, slotB]), true);
  assert.equal(snapshotsAreEqual([slotA], [slotC]), false);
  assert.equal(snapshotsAreEqual([slotA], [slotA, slotB]), false);
  assert.equal(snapshotsAreEqual(null, [slotA]), false);
  assert.equal(snapshotsAreEqual([slotA], undefined), false);
});
