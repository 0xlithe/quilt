(function () {
  "use strict";

  var Quilt = (window.Quilt = window.Quilt || {});

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

    if (this.actions > 0 && this.actions % 18 === 0) {
      Quilt.debugApi.log("Session fatigue break (actions)");
      var ms = Quilt.delayApi.randomInt(35000, 130000);
      await this._sleepChunked(ms, isCancelled);
    }

    var elapsed = Date.now() - this.startTime;
    if (elapsed > 22 * 60 * 1000 && Math.random() < 0.35) {
      await this._sleepChunked(
        Quilt.delayApi.randomInt(45000, 150000),
        isCancelled
      );
    }
  };

  SessionRuntime.prototype._sleepChunked = async function (ms, isCancelled) {
    var end = Date.now() + ms;
    while (Date.now() < end) {
      if (isCancelled && isCancelled()) return;
      await Quilt.delayApi.sleep(Math.min(900, end - Date.now()));
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
