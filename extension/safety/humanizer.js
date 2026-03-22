(function () {
  "use strict";

  var Quilt = (window.Quilt = window.Quilt || {});

  var BUCKET_FAST_THRESHOLD = 0.12;
  var BUCKET_FAST_MIN = 900;
  var BUCKET_FAST_CAP = 2200;
  var BUCKET_FAST_OVERSHOOT = 400;
  var BUCKET_NORMAL_THRESHOLD = 0.72;
  var BUCKET_NORMAL_FLOOR = 1500;
  var BUCKET_NORMAL_SPREAD = 500;
  var BUCKET_SLOW_THRESHOLD = 0.88;
  var BUCKET_SLOW_MIN = 10000;
  var BUCKET_SLOW_MAX = 28000;
  var LONG_TAIL_PROBABILITY = 0.22;
  var LONG_TAIL_MIN = 5000;
  var LONG_TAIL_MAX = 16000;
  var DEFAULT_MIN_MS = 2000;
  var DEFAULT_MAX_MS = 6000;
  var PRE_CLICK_MIN = 700;
  var PRE_CLICK_MAX = 4200;
  var AFTER_SCROLL_MIN = 450;
  var AFTER_SCROLL_MAX = 2600;
  var IDLE_BREAK_DEFAULT_PROBABILITY = 0.1;
  var IDLE_BREAK_MIN = 60000;
  var IDLE_BREAK_MAX = 300000;
  var IDLE_BREAK_CHUNK = 800;

  function R(a, b) {
    return Quilt.delayApi.randomInt(a, b);
  }

  function sleep(ms) {
    return Quilt.delayApi.sleep(ms);
  }

  function nextDelayMs(opts) {
    opts = opts || {};
    var umin = typeof opts.minMs === "number" ? opts.minMs : DEFAULT_MIN_MS;
    var umax = typeof opts.maxMs === "number" ? opts.maxMs : DEFAULT_MAX_MS;
    if (umax < umin) umax = umin;

    var roll = Math.random();
    if (roll < BUCKET_FAST_THRESHOLD) {
      return R(BUCKET_FAST_MIN, Math.min(BUCKET_FAST_CAP, umax + BUCKET_FAST_OVERSHOOT));
    }
    if (roll < BUCKET_NORMAL_THRESHOLD) {
      var lo = Math.max(BUCKET_NORMAL_FLOOR, umin);
      var hi = Math.max(lo + BUCKET_NORMAL_SPREAD, umax);
      return R(lo, hi);
    }
    if (roll < BUCKET_SLOW_THRESHOLD) {
      return R(BUCKET_SLOW_MIN, BUCKET_SLOW_MAX);
    }
    var base = R(umin, umax);
    if (Math.random() < LONG_TAIL_PROBABILITY) {
      base += R(LONG_TAIL_MIN, LONG_TAIL_MAX);
    }
    return base;
  }

  Quilt.humanizerApi = {
    nextDelayMs: nextDelayMs,

    /** Reading / dwell time before clicking (does not use patched randomDelay). */
    preClickReadingMs: function () {
      return R(PRE_CLICK_MIN, PRE_CLICK_MAX);
    },

    sleepPreClick: function () {
      return sleep(Quilt.humanizerApi.preClickReadingMs());
    },

    afterScrollPauseMs: function () {
      return R(AFTER_SCROLL_MIN, AFTER_SCROLL_MAX);
    },

    afterScrollPause: function () {
      return sleep(Quilt.humanizerApi.afterScrollPauseMs());
    },

    randomIdleBreakMaybe: async function (probability, isCancelled) {
      var p = typeof probability === "number" ? probability : IDLE_BREAK_DEFAULT_PROBABILITY;
      if (Math.random() >= p) return;
      var ms = R(IDLE_BREAK_MIN, IDLE_BREAK_MAX);
      Quilt.debugApi.log("Human idle break (ms)", ms);
      var end = Date.now() + ms;
      while (Date.now() < end) {
        if (isCancelled && isCancelled()) return;
        await sleep(Math.min(IDLE_BREAK_CHUNK, end - Date.now()));
      }
    },
  };

  Quilt.delayApi.randomDelay = function (minMs, maxMs) {
    return sleep(nextDelayMs({ minMs: minMs, maxMs: maxMs }));
  };
})();
