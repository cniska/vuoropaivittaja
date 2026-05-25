const test = require("node:test");
const assert = require("node:assert/strict");

const {
  sortSlotHistoryEntries,
  getNewHistoryFlashKeys,
  historyEntryKey,
} = require("./popup-helpers.js");
const { parseSlotDate } = require("./shared.js");

test("sortSlotHistoryEntries keeps removed slots last", () => {
  const sorted = sortSlotHistoryEntries(
    [
      {
        text: "Lauantai 22.6.2026 20:00 - 21:00",
        firstSeen: "2026-05-25T10:00:00.000Z",
        lastSeen: "2026-05-25T10:00:00.000Z",
        removedAt: "2026-05-25T11:00:00.000Z",
      },
      {
        text: "Perjantai 29.5.2026 20:00 - 21:00",
        firstSeen: "2026-05-25T09:00:00.000Z",
        lastSeen: "2026-05-25T09:00:00.000Z",
      },
      {
        text: "Torstai 28.5.2026 20:00 - 21:00",
        firstSeen: "2026-05-25T08:00:00.000Z",
        lastSeen: "2026-05-25T08:00:00.000Z",
      },
    ],
    parseSlotDate
  );

  assert.deepEqual(
    sorted.map((entry) => entry.text),
    [
      "Perjantai 29.5.2026 20:00 - 21:00",
      "Torstai 28.5.2026 20:00 - 21:00",
      "Lauantai 22.6.2026 20:00 - 21:00",
    ]
  );
});

test("sortSlotHistoryEntries sorts active slots newest first", () => {
  const sorted = sortSlotHistoryEntries(
    [
      {
        text: "Maanantai 2.6.2026 20:00 - 21:00",
        firstSeen: "2026-05-25T08:00:00.000Z",
        lastSeen: "2026-05-25T08:00:00.000Z",
      },
      {
        text: "Perjantai 29.5.2026 20:00 - 21:00",
        firstSeen: "2026-05-25T09:00:00.000Z",
        lastSeen: "2026-05-25T09:00:00.000Z",
      },
      {
        text: "Torstai 28.5.2026 20:00 - 21:00",
        firstSeen: "2026-05-25T10:00:00.000Z",
        lastSeen: "2026-05-25T10:00:00.000Z",
      },
    ],
    parseSlotDate
  );

  assert.deepEqual(
    sorted.map((entry) => entry.text),
    [
      "Torstai 28.5.2026 20:00 - 21:00",
      "Perjantai 29.5.2026 20:00 - 21:00",
      "Maanantai 2.6.2026 20:00 - 21:00",
    ]
  );
});

test("getNewHistoryFlashKeys skips the initial load", () => {
  const flashKeys = getNewHistoryFlashKeys(
    [],
    [
      {
        text: "Torstai 28.5.2026 20:00 - 21:00",
        firstSeen: "2026-05-25T10:00:00.000Z",
        lastSeen: "2026-05-25T10:00:00.000Z",
      },
    ],
    false
  );

  assert.deepEqual([...flashKeys], []);
});

test("getNewHistoryFlashKeys returns keys for later additions", () => {
  const flashKeys = getNewHistoryFlashKeys(
    [
      {
        text: "Perjantai 29.5.2026 20:00 - 21:00",
        firstSeen: "2026-05-25T09:00:00.000Z",
        lastSeen: "2026-05-25T09:00:00.000Z",
      },
    ],
    [
      {
        text: "Torstai 28.5.2026 20:00 - 21:00",
        firstSeen: "2026-05-25T10:00:00.000Z",
        lastSeen: "2026-05-25T10:00:00.000Z",
      },
      {
        text: "Perjantai 29.5.2026 20:00 - 21:00",
        firstSeen: "2026-05-25T09:00:00.000Z",
        lastSeen: "2026-05-25T09:00:00.000Z",
      },
    ],
    true
  );

  assert.deepEqual(
    [...flashKeys],
    ["2026-05-25T10:00:00.000Z::Torstai 28.5.2026 20:00 - 21:00"]
  );
});

test("historyEntryKey combines firstSeen and text", () => {
  assert.equal(
    historyEntryKey({
      firstSeen: "2026-05-25T10:00:00.000Z",
      text: "Torstai 28.5.2026 20:00 - 21:00",
    }),
    "2026-05-25T10:00:00.000Z::Torstai 28.5.2026 20:00 - 21:00"
  );
});
