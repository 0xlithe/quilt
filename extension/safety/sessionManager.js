(function () {
  "use strict";

  var Quilt = (window.Quilt = window.Quilt || {});

  var FATIGUE_BREAK_EVERY = 18;
  var FATIGUE_BREAK_MIN_MS = 35000;
  var FATIGUE_BREAK_MAX_MS = 130000;
  var LONG_SESSION_THRESHOLD_MS = 22 * 60 * 1000;
  var LONG_SESSION_BREAK_PROBABILITY = 0.35;
  var LONG_SESSION_BREAK_MIN_MS = 45000;
  var LONG_SESSION_BREAK_MAX_MS = 150000;
  var SLEEP_CHUNK_MS = 900;

  function SessionRuntime() {
    this.actions = 0;
    this.startTime = Date.now();
    this.fatigue = 0;
  }

  SessionRuntime.prototype.reset = function () {
    this.actions = 0;
    this.startTime = Date.now();
    this.fatigue = 0;
  };

  SessionRuntime.prototype.onSuccessfulAction = function () {
    this.actions += 1;
    this.fatigue += 1;
  };

  /**
   * Fatigue breaks: after N actions or long session wall time.
   */
  SessionRuntime.prototype.maybeFatigueBreak = async function (isCancelled) {
    if (isCancelled && isCancelled()) return;

    if (this.actions > 0 && this.actions % FATIGUE_BREAK_EVERY === 0) {
      Quilt.debugApi.log("Session fatigue break (actions)");
      var ms = Quilt.delayApi.randomInt(FATIGUE_BREAK_MIN_MS, FATIGUE_BREAK_MAX_MS);
      await this._sleepChunked(ms, isCancelled);
    }

    var elapsed = Date.now() - this.startTime;
    if (elapsed > LONG_SESSION_THRESHOLD_MS && Math.random() < LONG_SESSION_BREAK_PROBABILITY) {
      await this._sleepChunked(
        Quilt.delayApi.randomInt(LONG_SESSION_BREAK_MIN_MS, LONG_SESSION_BREAK_MAX_MS),
        isCancelled
      );
    }
  };

  SessionRuntime.prototype._sleepChunked = async function (ms, isCancelled) {
    var end = Date.now() + ms;
    while (Date.now() < end) {
      if (isCancelled && isCancelled()) return;
      await Quilt.delayApi.sleep(Math.min(SLEEP_CHUNK_MS, end - Date.now()));
    }
  };

  Quilt.sessionApi = {
    createRuntime: function () {
      return new SessionRuntime();
    },
  };

  Quilt.metricsApi = {
    _hourStarts: [],

    recordAction: function () {
      var now = Date.now();
      this._hourStarts.push(now);
      var cutoff = now - 60 * 60 * 1000;
      this._hourStarts = this._hourStarts.filter(function (t) {
        return t >= cutoff;
      });
    },

    recordFailure: function () {
      Quilt.debugApi.log("metrics: failure recorded");
    },

    recordCooldownTrigger: function (reason) {
      Quilt.debugApi.log("metrics: cooldown", reason);
    },

    getSnapshot: function () {
      var now = Date.now();
      var cutoff = now - 60 * 60 * 1000;
      var recent = this._hourStarts.filter(function (t) {
        return t >= cutoff;
      });
      return {
        actionsLastHour: recent.length,
      };
    },
  };
})();
