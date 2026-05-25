(function initializeVuoropaivittajaPopupHelpers(globalScope) {
  function sortSlotHistoryEntries(entries, parseSlotDate) {
    return Array.isArray(entries)
      ? entries.slice().sort((a, b) => {
          const aRemoved = Boolean(a?.removedAt);
          const bRemoved = Boolean(b?.removedAt);
          if (aRemoved !== bRemoved) {
            return aRemoved ? 1 : -1;
          }
          if (a?.firstSeen !== b?.firstSeen) {
            return String(b?.firstSeen || "").localeCompare(
              String(a?.firstSeen || "")
            );
          }
          const dateA = parseSlotDate(a?.text);
          const dateB = parseSlotDate(b?.text);
          if (dateA && dateB && dateA !== dateB) {
            return dateA.localeCompare(dateB);
          }
          return String(a?.lastSeen || "").localeCompare(
            String(b?.lastSeen || "")
          );
        })
      : [];
  }

  function getNewHistoryFlashKeys(previousEntries, nextEntries, allowFlash) {
    if (!allowFlash || !Array.isArray(nextEntries)) {
      return new Set();
    }

    const previousKeys = new Set(
      Array.isArray(previousEntries) ? previousEntries.map(historyEntryKey) : []
    );
    const flashKeys = new Set();

    for (const entry of nextEntries) {
      const key = historyEntryKey(entry);
      if (!previousKeys.has(key)) {
        flashKeys.add(key);
      }
    }

    return flashKeys;
  }

  function historyEntryKey(entry) {
    return `${String(entry?.firstSeen || "")}::${String(entry?.text || "")}`;
  }

  const api = {
    sortSlotHistoryEntries,
    getNewHistoryFlashKeys,
  };

  globalScope.VuoropaivittajaPopupHelpers = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
