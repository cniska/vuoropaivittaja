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

  const api = {
    shouldStartMonitoring,
    snapshotsAreEqual,
  };

  globalScope.VuoropaivittajaContentHelpers = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(globalThis);
