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

  const api = {
    shouldStartMonitoring,
    snapshotsAreEqual,
    parseSlotText,
  };

  globalScope.VuoropaivittajaContentHelpers = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(globalThis);
