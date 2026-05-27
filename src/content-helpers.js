(function initializeVuoropaivittajaContentHelpers(globalScope) {
  function shouldStartMonitoring(settings, rule, canMonitorTab, hasTarget) {
    return Boolean(settings?.enabled && rule && canMonitorTab && hasTarget);
  }

  function snapshotsAreEqual(before, after) {
    if (!Array.isArray(before) || !Array.isArray(after)) {
      return false;
    }

    if (before.length !== after.length) {
      return false;
    }

    for (let index = 0; index < before.length; index += 1) {
      if (before[index] !== after[index]) {
        return false;
      }
    }

    return true;
  }

  function parseDow(raw) {
    return (
      (raw.match(
        /Maanantai|Tiistai|Keskiviikko|Torstai|Perjantai|Lauantai|Sunnuntai/
      ) || [])[0] || ""
    );
  }

  function parseSlotText(raw) {
    const date = (raw.match(/\d{1,2}\.\d{1,2}\.(\d{4})?/) || [])[0] || "";
    const dow = parseDow(raw);
    const time =
      (raw.match(/\d{1,2}[.:]\d{2}\s*[-–]\s*\d{1,2}[.:]\d{2}/) || [])[0] || "";
    return [dow, date, time].filter(Boolean).join(" ").trim();
  }

  function normalizeSlotLines(lines) {
    return Array.isArray(lines)
      ? lines.map((line) => String(line || "").trim()).filter(Boolean)
      : [];
  }

  function findNewSlotLines(before, after) {
    const beforeSet = new Set(normalizeSlotLines(before));
    const seen = new Set();

    return normalizeSlotLines(after).filter((line) => {
      if (beforeSet.has(line) || seen.has(line)) {
        return false;
      }

      seen.add(line);
      return true;
    });
  }

  function findNewSlotLinesAcrossSnapshots(before, snapshots) {
    const beforeSet = new Set(normalizeSlotLines(before));
    const seen = new Set();
    const result = [];

    if (!Array.isArray(snapshots)) {
      return result;
    }

    for (const snapshot of snapshots) {
      for (const line of normalizeSlotLines(snapshot)) {
        if (beforeSet.has(line) || seen.has(line)) {
          continue;
        }

        seen.add(line);
        result.push(line);
      }
    }

    return result;
  }

  function hasNewSlotLines(before, after) {
    return findNewSlotLines(before, after).length > 0;
  }

  function hasNewSlotLinesAcrossSnapshots(before, snapshots) {
    return findNewSlotLinesAcrossSnapshots(before, snapshots).length > 0;
  }

  function summarizeObservedSlotSnapshots(
    before,
    snapshots,
    stableReadsRequired = 2
  ) {
    const normalizedSnapshots = Array.isArray(snapshots)
      ? snapshots.map((snapshot) => normalizeSlotLines(snapshot))
      : [];
    const nonEmptySnapshots = normalizedSnapshots.filter(
      (snapshot) => snapshot.length > 0
    );
    const afterSlots =
      nonEmptySnapshots.length > 0
        ? nonEmptySnapshots[nonEmptySnapshots.length - 1]
        : [];
    const newSlotLines = findNewSlotLinesAcrossSnapshots(
      before,
      normalizedSnapshots
    );

    let stableCount = 0;
    let previousSnapshot = null;

    for (const snapshot of normalizedSnapshots) {
      if (
        previousSnapshot &&
        snapshot.length > 0 &&
        snapshotsAreEqual(previousSnapshot, snapshot)
      ) {
        stableCount += 1;
      } else {
        stableCount = 1;
      }

      previousSnapshot = snapshot;
    }

    return {
      afterSlots,
      newSlotLines,
      slotSnapshots: nonEmptySnapshots,
      stableCount,
      stabilized:
        previousSnapshot !== null &&
        previousSnapshot.length > 0 &&
        stableCount >= stableReadsRequired,
    };
  }

  function simulatePostRefreshObservation(
    before,
    snapshots,
    stableReadsRequired = 2
  ) {
    const normalizedSnapshots = Array.isArray(snapshots)
      ? snapshots.map((snapshot) => normalizeSlotLines(snapshot))
      : [];
    const slotSnapshots = [];
    const seenNewLines = new Set();
    let alertAtIndex = -1;
    let alertedNewSlotLines = [];
    let afterSlots = [];
    let stableCount = 0;
    let previousSnapshot = null;

    for (let index = 0; index < normalizedSnapshots.length; index += 1) {
      const snapshot = normalizedSnapshots[index];

      if (snapshot.length > 0) {
        slotSnapshots.push(snapshot);
        afterSlots = snapshot;
      }

      const newSlotLines = findNewSlotLines(before, snapshot);
      if (alertAtIndex === -1 && newSlotLines.length > 0) {
        alertAtIndex = index;
        alertedNewSlotLines = newSlotLines;
      }

      for (const line of newSlotLines) {
        seenNewLines.add(line);
      }

      if (
        previousSnapshot &&
        snapshot.length > 0 &&
        snapshotsAreEqual(previousSnapshot, snapshot)
      ) {
        stableCount += 1;
      } else {
        stableCount = 1;
      }

      previousSnapshot = snapshot;
    }

    return {
      alertAtIndex,
      alerted: alertAtIndex !== -1,
      alertedNewSlotLines,
      afterSlots,
      allNewSlotLines: Array.from(seenNewLines),
      slotSnapshots,
      stableCount,
      stabilized:
        previousSnapshot !== null &&
        previousSnapshot.length > 0 &&
        stableCount >= stableReadsRequired,
    };
  }

  function shouldNotifyForRefresh(
    beforeSnapshot,
    afterSnapshot,
    beforeSlots,
    afterSlots,
    hasListSelector
  ) {
    return hasListSelector
      ? hasNewSlotLines(beforeSlots, afterSlots)
      : !snapshotsAreEqual(beforeSnapshot, afterSnapshot);
  }

  const api = {
    shouldStartMonitoring,
    snapshotsAreEqual,
    parseSlotText,
    findNewSlotLines,
    findNewSlotLinesAcrossSnapshots,
    hasNewSlotLines,
    hasNewSlotLinesAcrossSnapshots,
    summarizeObservedSlotSnapshots,
    simulatePostRefreshObservation,
    shouldNotifyForRefresh,
  };

  globalScope.VuoropaivittajaContentHelpers = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(globalThis);
