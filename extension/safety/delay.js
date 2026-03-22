(function () {
  "use strict";

  var Quilt = (window.Quilt = window.Quilt || {});

  function randomInt(min, max) {
    var lo = Math.ceil(min);
    var hi = Math.floor(max);
    return Math.floor(Math.random() * (hi - lo + 1)) + lo;
  }

  Quilt.delayApi = {
    randomInt: randomInt,

    sleep: function (ms) {
      return new Promise(function (resolve) {
        setTimeout(resolve, ms);
      });
    },

    randomDelay: function (minMs, maxMs) {
      var ms = randomInt(minMs, maxMs);
      return Quilt.delayApi.sleep(ms);
    },
  };
})();
