(function () {
  "use strict";

  var Quilt = (window.Quilt = window.Quilt || {});

  var KEY_LEVEL = "quilt_cooldown_level";
  var KEY_UNTIL = "quilt_cooldown_until_ms";

  function CooldownApi() {
    this._successStreak = 0;
  }

  CooldownApi.prototype._durationMs = function (level) {
    var base = 60000 * Math.pow(2, Math.max(0, level));
    return Math.min(base, 15 * 60 * 1000);
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
    var lastEmit = 0;
    while (true) {
      if (isCancelled && isCancelled()) return;
      var r = await Quilt.storageApi.get([KEY_UNTIL]);
      var u = r[KEY_UNTIL] || 0;
      var now = Date.now();
      if (now >= u) return;
      var remaining = u - now;
      if (typeof onWaiting === "function" && now - lastEmit >= 30000) {
        lastEmit = now;
        onWaiting(remaining);
      }
      var slice = Math.min(1000, remaining);
      await Quilt.delayApi.sleep(slice);
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
    if (this._successStreak >= 10) {
      this._successStreak = 0;
      await Quilt.storageApi.set({ [KEY_LEVEL]: 0 });
      Quilt.debugApi.log("Cooldown level reset after success streak");
    }
  };

  CooldownApi.prototype.enterRateLimitCooldown = async function (reason) {
    var ms = 5 * 60 * 1000;
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
