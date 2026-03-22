(function () {
  "use strict";

  var Quilt = (window.Quilt = window.Quilt || {});

  var DEFAULT_MAX_PER_RUN = 20;

  function RateLimiter(options) {
    var o = options || {};
    this.maxPerDay =
      typeof o.maxPerDay === "number" &&
      Number.isFinite(o.maxPerDay) &&
      o.maxPerDay >= 1
        ? o.maxPerDay
        : null;
    this.maxPerRun =
      typeof o.maxPerRun === "number" ? o.maxPerRun : DEFAULT_MAX_PER_RUN;
    this.runCount = 0;
    this.suspicionPause = false;
  }

  RateLimiter.prototype.setSuspicionPause = function (on) {
    this.suspicionPause = !!on;
  };

  RateLimiter.prototype.canProceed = function () {
    if (this.suspicionPause) {
      return Promise.resolve({
        ok: false,
        reason: "suspicion_pause",
      });
    }
    var self = this;
    if (self.runCount >= self.maxPerRun) {
      return Promise.resolve({
        ok: false,
        reason: "run_limit",
      });
    }
    if (self.maxPerDay == null) {
      return Promise.resolve({ ok: true });
    }
    return Quilt.storageApi.getSessionCounts().then(function (s) {
      if (s.count >= self.maxPerDay) {
        return { ok: false, reason: "daily_limit" };
      }
      return { ok: true };
    });
  };

  RateLimiter.prototype.recordAction = function () {
    this.runCount += 1;
    return Quilt.storageApi.incrementSessionCount(1);
  };

  RateLimiter.prototype.resetRun = function () {
    this.runCount = 0;
  };

  Quilt.RateLimiter = RateLimiter;
})();
