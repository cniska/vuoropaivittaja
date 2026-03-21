// ==UserScript==
// @name         Power Apps Auto Clicker
// @namespace    https://github.com/cniska/auto-clicker
// @version      1.0.0
// @description  Click a chosen Power Apps button on a repeating interval.
// @author       cniska
// @match        https://apps.powerapps.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const CONFIG = {
    selector: 'button[aria-label="Päivitä luettelo"]',
    matchIndex: 2,
    intervalMs: 1000,
    autoStart: true,
    debug: true
  };

  const MIN_INTERVAL_MS = 500;
  const STORAGE_KEY = "power-apps-auto-clicker-config";
  const START_DELAY_MS = 1500;

  let timerId = null;

  const config = loadConfig();
  exposeControls();

  if (config.autoStart) {
    window.setTimeout(() => {
      startAutoClicker();
    }, START_DELAY_MS);
  }

  function loadConfig() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      return normalizeConfig(saved ? { ...CONFIG, ...saved } : CONFIG);
    } catch {
      return normalizeConfig(CONFIG);
    }
  }

  function saveConfig(nextConfig) {
    const normalized = normalizeConfig(nextConfig);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }

  function normalizeConfig(value) {
    return {
      selector: String(value.selector || CONFIG.selector).trim(),
      matchIndex: Math.max(1, Math.floor(Number(value.matchIndex) || CONFIG.matchIndex)),
      intervalMs: Math.max(MIN_INTERVAL_MS, Number(value.intervalMs) || CONFIG.intervalMs),
      autoStart: Boolean(value.autoStart),
      debug: Boolean(value.debug)
    };
  }

  function exposeControls() {
    window.powerAppsAutoClicker = {
      getConfig() {
        return { ...config };
      },
      setConfig(partialConfig) {
        Object.assign(config, saveConfig({ ...config, ...partialConfig }));
        log("Updated config:", config);
        return { ...config };
      },
      start: startAutoClicker,
      stop: stopAutoClicker,
      clickNow: clickNow,
      findButtons: findButtons,
      help() {
        console.table({
          selector: config.selector,
          matchIndex: config.matchIndex,
          intervalMs: config.intervalMs,
          autoStart: config.autoStart,
          debug: config.debug
        });
        console.log('Use powerAppsAutoClicker.setConfig({ selector: "...", matchIndex: 2, intervalMs: 1000 })');
      }
    };

    log("Loaded. Run powerAppsAutoClicker.help() in the console for commands.");
  }

  function startAutoClicker() {
    stopAutoClicker();

    timerId = window.setInterval(() => {
      clickNow();
    }, config.intervalMs);

    log(`Started with selector "${config.selector}", match ${config.matchIndex}, every ${config.intervalMs} ms.`);
    return true;
  }

  function stopAutoClicker() {
    if (timerId !== null) {
      window.clearInterval(timerId);
      timerId = null;
      log("Stopped.");
    }
  }

  function clickNow() {
    const buttons = findButtons();
    const button = buttons[config.matchIndex - 1];

    if (!button) {
      log(`No match ${config.matchIndex}. Found ${buttons.length} button(s).`);
      return false;
    }

    triggerInteraction(button);
    log(`Clicked match ${config.matchIndex}.`, button);
    return true;
  }

  function findButtons() {
    try {
      return Array.from(document.querySelectorAll(config.selector));
    } catch (error) {
      console.error("[Power Apps Auto Clicker] Invalid selector:", error);
      return [];
    }
  }

  function triggerInteraction(element) {
    element.scrollIntoView({
      block: "center",
      inline: "center",
      behavior: "instant"
    });

    if (typeof element.focus === "function") {
      element.focus({ preventScroll: true });
    }

    const rect = element.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;
    const baseOptions = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      button: 0,
      buttons: 1,
      clientX,
      clientY
    };

    dispatchIfSupported(element, "pointerover", PointerEvent, {
      ...baseOptions,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true
    });
    dispatchIfSupported(element, "mouseover", MouseEvent, baseOptions);
    dispatchIfSupported(element, "pointerdown", PointerEvent, {
      ...baseOptions,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true
    });
    dispatchIfSupported(element, "mousedown", MouseEvent, baseOptions);
    dispatchIfSupported(element, "pointerup", PointerEvent, {
      ...baseOptions,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true
    });
    dispatchIfSupported(element, "mouseup", MouseEvent, baseOptions);
    dispatchIfSupported(element, "click", MouseEvent, baseOptions);

    if (typeof element.click === "function") {
      element.click();
    }
  }

  function dispatchIfSupported(element, type, EventType, options) {
    if (typeof EventType !== "function") {
      return;
    }

    element.dispatchEvent(new EventType(type, options));
  }

  function log(...args) {
    if (!config.debug) {
      return;
    }

    console.log("[Power Apps Auto Clicker]", ...args);
  }
})();
