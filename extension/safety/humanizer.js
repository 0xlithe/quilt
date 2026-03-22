(function () {
  "use strict";

  var Quilt = (window.Quilt = window.Quilt || {});

  function R(a, b) {
    return Quilt.delayApi.randomInt(a, b);
  }

  function sleep(ms) {
    return Quilt.delayApi.sleep(ms);
  }

  /**
   * Between-action delay: weighted buckets + user bounds + occasional long tail.
   */
  function nextDelayMs(opts) {
    opts = opts || {};
    var umin = typeof opts.minMs === "number" ? opts.minMs : 2000;
    var umax = typeof opts.maxMs === "number" ? opts.maxMs : 6000;
    if (umax < umin) umax = umin;

    var roll = Math.random();
    if (roll < 0.12) {
      return R(900, Math.min(2200, umax + 400));
    }
    if (roll < 0.72) {
      var lo = Math.max(1500, umin);
      var hi = Math.max(lo + 500, umax);
      return R(lo, hi);
    }
    if (roll < 0.88) {
      return R(10000, 28000);
    }
    var base = R(umin, umax);
    if (Math.random() < 0.22) {
      base += R(5000, 16000);
    }
    return base;
  }

  Quilt.humanizerApi = {
    nextDelayMs: nextDelayMs,

    /** Reading / dwell time before clicking (does not use patched randomDelay). */
    preClickReadingMs: function () {
      return R(700, 4200);
    },

    sleepPreClick: function () {
      return sleep(Quilt.humanizerApi.preClickReadingMs());
    },

    afterScrollPauseMs: function () {
      return R(450, 2600);
    },

    afterScrollPause: function () {
      return sleep(Quilt.humanizerApi.afterScrollPauseMs());
    },

    /**
     * Occasional distracted idle (default ~10% per call).
     */
    randomIdleBreakMaybe: async function (probability, isCancelled) {
      var p = typeof probability === "number" ? probability : 0.1;
      if (Math.random() >= p) return;
      var ms = R(60000, 300000);
      Quilt.debugApi.log("Human idle break (ms)", ms);
      var end = Date.now() + ms;
      while (Date.now() < end) {
        if (isCancelled && isCancelled()) return;
        await sleep(Math.min(800, end - Date.now()));
      }
    },
  };

  Quilt.delayApi.randomDelay = function (minMs, maxMs) {
    return sleep(nextDelayMs({ minMs: minMs, maxMs: maxMs }));
  };
})();
