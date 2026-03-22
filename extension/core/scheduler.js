(function () {
  "use strict";

  var Quilt = (window.Quilt = window.Quilt || {});

  Quilt.schedulerApi = {
    /**
     * Run async tasks in sequence. Stops if a task returns { stop: true } or throws.
     */
    runSequence: async function (tasks, shouldAbort) {
      for (var i = 0; i < tasks.length; i++) {
        if (shouldAbort && shouldAbort()) break;
        var t = tasks[i];
        if (typeof t === "function") {
          var r = await t();
          if (r && r.stop) break;
        }
      }
    },

    /**
     * Schedule a single delayed callback (uses safety delay helper).
     */
    afterDelay: function (minMs, maxMs, fn) {
      return Quilt.delayApi.randomDelay(minMs, maxMs).then(fn);
    },
  };
})();
