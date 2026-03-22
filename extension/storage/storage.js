(function () {
  "use strict";

  var Quilt = (window.Quilt = window.Quilt || {});

  var KEYS = {
    SESSION_ACTION_COUNT: "quilt_session_action_count",
    SESSION_DAY: "quilt_session_day",
    FOLLOWED_IDS: "quilt_followed_ids",
    LIKED_TWEET_IDS: "quilt_liked_tweet_ids",
    FIRST_SEEN_MS: "quilt_first_seen_ms",
  };

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }

  Quilt.storageApi = {
    KEYS: KEYS,

    get: function (keys) {
      return new Promise(function (resolve, reject) {
        chrome.storage.local.get(keys, function (result) {
          var err = chrome.runtime.lastError;
          if (err) reject(err);
          else resolve(result);
        });
      });
    },

    set: function (items) {
      return new Promise(function (resolve, reject) {
        chrome.storage.local.set(items, function () {
          var err = chrome.runtime.lastError;
          if (err) {
            var msg = err.message || "";
            if (/quota/i.test(msg) || /QUOTA_BYTES/i.test(msg)) {
              Quilt.debugApi && Quilt.debugApi.log("Storage quota exceeded:", msg);
            }
            reject(err);
          } else {
            resolve();
          }
        });
      });
    },

    getFollowedIdSet: function () {
      return Quilt.storageApi.get([KEYS.FOLLOWED_IDS]).then(function (r) {
        var raw = r[KEYS.FOLLOWED_IDS];
        if (!raw || !Array.isArray(raw)) return new Set();
        return new Set(raw);
      });
    },

    saveFollowedIdSet: function (set) {
      return Quilt.storageApi.set({
        [KEYS.FOLLOWED_IDS]: Array.from(set),
      });
    },

    getLikedTweetIdSet: function () {
      return Quilt.storageApi.get([KEYS.LIKED_TWEET_IDS]).then(function (r) {
        var raw = r[KEYS.LIKED_TWEET_IDS];
        if (!raw || !Array.isArray(raw)) return new Set();
        return new Set(raw);
      });
    },

    saveLikedTweetIdSet: function (set) {
      return Quilt.storageApi.set({
        [KEYS.LIKED_TWEET_IDS]: Array.from(set),
      });
    },

    getSessionCounts: function () {
      return Quilt.storageApi
        .get([KEYS.SESSION_ACTION_COUNT, KEYS.SESSION_DAY])
        .then(function (r) {
          var day = r[KEYS.SESSION_DAY];
          var count = r[KEYS.SESSION_ACTION_COUNT] || 0;
          if (day !== todayKey()) {
            return { day: todayKey(), count: 0 };
          }
          return { day: day, count: count };
        });
    },

    incrementSessionCount: function (delta) {
      return Quilt.storageApi
        .get([KEYS.SESSION_ACTION_COUNT, KEYS.SESSION_DAY])
        .then(function (r) {
          var day = r[KEYS.SESSION_DAY];
          var count = r[KEYS.SESSION_ACTION_COUNT] || 0;
          if (day !== todayKey()) {
            day = todayKey();
            count = 0;
          }
          count += delta || 1;
          return Quilt.storageApi.set({
            [KEYS.SESSION_DAY]: day,
            [KEYS.SESSION_ACTION_COUNT]: count,
          }).then(function () {
            return count;
          });
        });
    },

    ensureFirstSeenMs: function () {
      return Quilt.storageApi.get([KEYS.FIRST_SEEN_MS]).then(function (r) {
        if (r[KEYS.FIRST_SEEN_MS]) return r[KEYS.FIRST_SEEN_MS];
        var n = Date.now();
        return Quilt.storageApi
          .set({ [KEYS.FIRST_SEEN_MS]: n })
          .then(function () {
            return n;
          });
      });
    },

    /**
     * First ~3 days: cap 20/day; next ~4 days: cap 80/day; then requested.
     */
    getWarmupAdjustedMaxPerDay: function (requestedMax) {
      if (typeof requestedMax !== "number" || !Number.isFinite(requestedMax)) {
        return Promise.resolve(requestedMax);
      }
      return Quilt.storageApi.ensureFirstSeenMs().then(function (first) {
        var days = Math.floor((Date.now() - first) / 86400000);
        if (days < 3) return Math.min(requestedMax, 20);
        if (days < 7) return Math.min(requestedMax, 80);
        return requestedMax;
      });
    },
  };
})();
