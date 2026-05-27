const test = require("node:test");
const assert = require("node:assert/strict");

const {
  shouldStartMonitoring,
  snapshotsAreEqual,
  parseSlotText,
  findNewSlotLines,
  findNewSlotLinesAcrossSnapshots,
  hasNewSlotLines,
  hasNewSlotLinesAcrossSnapshots,
  summarizeObservedSlotSnapshots,
  shouldNotifyForRefresh,
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

test("findNewSlotLines returns only newly added slots", () => {
  const oldSlots = [
    "Maanantai 1.6.2026 08:00–16:00",
    "Tiistai 2.6.2026 08:00–16:00",
  ];
  const nextSlots = [
    "Tiistai 2.6.2026 08:00–16:00",
    "Keskiviikko 3.6.2026 08:00–16:00",
  ];

  assert.deepEqual(findNewSlotLines(oldSlots, nextSlots), [
    "Keskiviikko 3.6.2026 08:00–16:00",
  ]);
  assert.deepEqual(findNewSlotLines(oldSlots, oldSlots.slice().reverse()), []);
  assert.deepEqual(findNewSlotLines(oldSlots, [oldSlots[0]]), []);
});

test("hasNewSlotLines ignores removals and reordering", () => {
  const oldSlots = [
    "Maanantai 1.6.2026 08:00–16:00",
    "Tiistai 2.6.2026 08:00–16:00",
  ];
  const removedOnly = ["Maanantai 1.6.2026 08:00–16:00"];
  const reordered = oldSlots.slice().reverse();
  const withNewSlot = [...reordered, "Keskiviikko 3.6.2026 08:00–16:00"];

  assert.equal(hasNewSlotLines(oldSlots, removedOnly), false);
  assert.equal(hasNewSlotLines(oldSlots, reordered), false);
  assert.equal(hasNewSlotLines(oldSlots, withNewSlot), true);
});

test("findNewSlotLinesAcrossSnapshots catches slots that appear on a later poll", () => {
  const oldSlots = [
    "Maanantai 1.6.2026 08:00–16:00",
    "Tiistai 2.6.2026 08:00–16:00",
  ];
  const snapshots = [
    ["Maanantai 1.6.2026 08:00–16:00"],
    ["Maanantai 1.6.2026 08:00–16:00", "Keskiviikko 3.6.2026 08:00–16:00"],
    [
      "Keskiviikko 3.6.2026 08:00–16:00",
      "Torstai 4.6.2026 08:00–16:00",
      "Maanantai 1.6.2026 08:00–16:00",
    ],
  ];

  assert.deepEqual(findNewSlotLinesAcrossSnapshots(oldSlots, snapshots), [
    "Keskiviikko 3.6.2026 08:00–16:00",
    "Torstai 4.6.2026 08:00–16:00",
  ]);
  assert.equal(hasNewSlotLinesAcrossSnapshots(oldSlots, snapshots), true);
  assert.deepEqual(findNewSlotLinesAcrossSnapshots(oldSlots, []), []);
});

test("summarizeObservedSlotSnapshots resolves a slow-rendering refresh", () => {
  const beforeSlots = [
    "Maanantai 1.6.2026 08:00–16:00",
    "Tiistai 2.6.2026 08:00–16:00",
  ];
  const observedSlotSnapshots = [
    ["Maanantai 1.6.2026 08:00–16:00"],
    ["Maanantai 1.6.2026 08:00–16:00", "Keskiviikko 3.6.2026 08:00–16:00"],
    ["Maanantai 1.6.2026 08:00–16:00", "Keskiviikko 3.6.2026 08:00–16:00"],
  ];

  const summary = summarizeObservedSlotSnapshots(
    beforeSlots,
    observedSlotSnapshots
  );

  assert.deepEqual(summary.newSlotLines, ["Keskiviikko 3.6.2026 08:00–16:00"]);
  assert.deepEqual(summary.afterSlots, [
    "Maanantai 1.6.2026 08:00–16:00",
    "Keskiviikko 3.6.2026 08:00–16:00",
  ]);
  assert.deepEqual(summary.slotSnapshots, [
    ["Maanantai 1.6.2026 08:00–16:00"],
    ["Maanantai 1.6.2026 08:00–16:00", "Keskiviikko 3.6.2026 08:00–16:00"],
    ["Maanantai 1.6.2026 08:00–16:00", "Keskiviikko 3.6.2026 08:00–16:00"],
  ]);
  assert.equal(summary.stabilized, true);
});

test("shouldNotifyForRefresh ignores removals and reordering when a list selector exists", () => {
  const beforeSnapshot = [
    "Maanantai\n1.6.\n08:00–16:00",
    "Tiistai\n2.6.\n08:00–16:00",
  ];
  const reorderedSnapshot = beforeSnapshot.slice().reverse();
  const removalSnapshot = [beforeSnapshot[0]];
  const newSlotSnapshot = [
    "Keskiviikko\n3.6.\n08:00–16:00",
    "Maanantai\n1.6.\n08:00–16:00",
    "Tiistai\n2.6.\n08:00–16:00",
  ];

  assert.equal(
    shouldNotifyForRefresh(
      beforeSnapshot,
      removalSnapshot,
      ["Maanantai 1.6.2026 08:00–16:00", "Tiistai 2.6.2026 08:00–16:00"],
      ["Tiistai 2.6.2026 08:00–16:00"],
      true
    ),
    false
  );
  assert.equal(
    shouldNotifyForRefresh(
      beforeSnapshot,
      reorderedSnapshot,
      ["Maanantai 1.6.2026 08:00–16:00", "Tiistai 2.6.2026 08:00–16:00"],
      ["Tiistai 2.6.2026 08:00–16:00", "Maanantai 1.6.2026 08:00–16:00"],
      true
    ),
    false
  );
  assert.equal(
    shouldNotifyForRefresh(
      beforeSnapshot,
      newSlotSnapshot,
      ["Maanantai 1.6.2026 08:00–16:00", "Tiistai 2.6.2026 08:00–16:00"],
      [
        "Keskiviikko 3.6.2026 08:00–16:00",
        "Maanantai 1.6.2026 08:00–16:00",
        "Tiistai 2.6.2026 08:00–16:00",
      ],
      true
    ),
    true
  );
});

test("shouldNotifyForRefresh falls back to snapshot comparison without a list selector", () => {
  const beforeSnapshot = ["Keskiviikko 28.5. 06:00–14:00"];
  const sameAfterSnapshot = ["Keskiviikko 28.5. 06:00–14:00"];
  const changedAfterSnapshot = ["Keskiviikko 28.5. 06:00–14:00", "Uusi"];

  assert.equal(
    shouldNotifyForRefresh(beforeSnapshot, sameAfterSnapshot, [], [], false),
    false
  );
  assert.equal(
    shouldNotifyForRefresh(beforeSnapshot, changedAfterSnapshot, [], [], false),
    true
  );
});
