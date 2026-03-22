(function () {
  "use strict";

  var Quilt = (window.Quilt = window.Quilt || {});

  Quilt.TIER_LIMITS = {
    free: {
      follow:   { maxPerRun: 50,   maxPerDay: null },
      unfollow: { maxPerRun: 50,   maxPerDay: null },
      like:     { maxPerRun: null,  maxPerDay: 200  },
      unlike:   { maxPerRun: null,  maxPerDay: 200  },
    },
    premium: {
      follow:   { maxPerRun: null, maxPerDay: null },
      unfollow: { maxPerRun: null, maxPerDay: null },
      like:     { maxPerRun: null, maxPerDay: null },
      unlike:   { maxPerRun: null, maxPerDay: null },
    },
  };
})();
