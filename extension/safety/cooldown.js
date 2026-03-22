(function () {
  "use strict";

  var Quilt = (window.Quilt = window.Quilt || {});

  var KEY_LEVEL = "quilt_cooldown_level";
  var KEY_UNTIL = "quilt_cooldown_until_ms";
  var BASE_COOLDOWN_MS = 60000;
  var MAX_COOLDOWN_MS = 15 * 60 * 1000;
  var RATE_LIMIT_COOLDOWN_MS = 5 * 60 * 1000;
  var SUCCESS_STREAK_RESET = 10;
  var POLL_INTERVAL_MS = 5000;
  var EMIT_INTERVAL_MS = 30000;

  function CooldownApi() {
    this._successStreak = 0;
  }

  CooldownApi.prototype._durationMs = function (level) {
    var base = BASE_COOLDOWN_MS * Math.pow(2, Math.max(0, level));
    return Math.min(base, MAX_COOLDOWN_MS);
  };

  CooldownApi.prototype.isActive = function () {
    return Quilt.storageApi.get([KEY_UNTIL]).then(function (r) {
      var u = r[KEY_UNTIL] || 0;
      return Date.now() < u;
    });
  };

  CooldownApi.prototype.remainingMs = function () {
    return Quilt.storageApi.get([KEY_UNTIL]).then(function (r) {
      var u = r[KEY_UNTIL] || 0;
      return Math.max(0, u - Date.now());
    });
  };

  /**
   * Block until cooldown ends or isCancelled() returns true.
   * @param {function(): boolean} [isCancelled]
   * @param {function(number): void} [onWaiting] called every ~30s with remaining ms
   */
  CooldownApi.prototype.waitUntilClear = async function (isCancelled, onWaiting) {
    var r = await Quilt.storageApi.get([KEY_UNTIL]);
    var u = r[KEY_UNTIL] || 0;
    if (Date.now() >= u) return;

    var lastEmit = 0;
    var resolved = false;
    var wakeResolve = null;

    function onChange(changes, area) {
      if (area !== "local" || !changes[KEY_UNTIL]) return;
      var nv = changes[KEY_UNTIL].newValue || 0;
      if (Date.now() >= nv && wakeResolve) {
        wakeResolve();
      }
    }
    chrome.storage.onChanged.addListener(onChange);

    try {
      while (!resolved) {
        if (isCancelled && isCancelled()) return;
        var r2 = await Quilt.storageApi.get([KEY_UNTIL]);
        u = r2[KEY_UNTIL] || 0;
        var now = Date.now();
        if (now >= u) return;
        var remaining = u - now;
        if (typeof onWaiting === "function" && now - lastEmit >= EMIT_INTERVAL_MS) {
          lastEmit = now;
          onWaiting(remaining);
        }
        var slice = Math.min(POLL_INTERVAL_MS, remaining);
        await new Promise(function (resolve) {
          wakeResolve = resolve;
          setTimeout(resolve, slice);
        });
        wakeResolve = null;
      }
    } finally {
      chrome.storage.onChanged.removeListener(onChange);
    }
  };

  CooldownApi.prototype.enterCooldown = async function (reason) {
    var r = await Quilt.storageApi.get([KEY_LEVEL]);
    var level = typeof r[KEY_LEVEL] === "number" ? r[KEY_LEVEL] : 0;
    var ms = this._durationMs(level);
    var until = Date.now() + ms;
    await Quilt.storageApi.set({
      [KEY_UNTIL]: until,
      [KEY_LEVEL]: level + 1,
    });
    Quilt.debugApi.log("Cooldown entered:", reason, "ms", ms, "level", level);
    await Quilt.metricsApi.recordCooldownTrigger(reason);
    return { until: until, ms: ms, level: level };
  };

  CooldownApi.prototype.resetLevel = function () {
    this._successStreak = 0;
    return Quilt.storageApi.set({ [KEY_LEVEL]: 0 });
  };

  /** Call after a verified successful engagement to decay strike level over time. */
  CooldownApi.prototype.noteSuccessfulAction = async function () {
    this._successStreak += 1;
    if (this._successStreak >= SUCCESS_STREAK_RESET) {
      this._successStreak = 0;
      await Quilt.storageApi.set({ [KEY_LEVEL]: 0 });
      Quilt.debugApi.log("Cooldown level reset after success streak");
    }
  };

  CooldownApi.prototype.enterRateLimitCooldown = async function (reason) {
    var ms = RATE_LIMIT_COOLDOWN_MS;
    var until = Date.now() + ms;
    await Quilt.storageApi.set({
      [KEY_UNTIL]: until,
      [KEY_LEVEL]: 0,
    });
    Quilt.debugApi.log("Rate-limit cooldown:", reason, "ms", ms);
    await Quilt.metricsApi.recordCooldownTrigger(reason);
    return { until: until, ms: ms };
  };

  CooldownApi.prototype.noteFailure = function () {
    this._successStreak = 0;
  };

  Quilt.cooldownApi = new CooldownApi();
})();
