(function () {
  "use strict";

  var Quilt = (window.Quilt = window.Quilt || {});

  var KEY = "quilt_debug_enabled";

  Quilt.debugApi = {
    enabled: false,

    log: function () {
      if (!Quilt.debugApi.enabled) return;
      var args = Array.prototype.slice.call(arguments);
      args.unshift("[Quilt]");
      console.log.apply(console, args);
    },

    setEnabled: function (on) {
      Quilt.debugApi.enabled = !!on;
      return Quilt.storageApi.set({ [KEY]: Quilt.debugApi.enabled });
    },

    loadFromStorage: function () {
      return Quilt.storageApi.get([KEY]).then(function (r) {
        Quilt.debugApi.enabled = !!r[KEY];
      });
    },
  };

  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== "local" || !changes[KEY]) return;
      Quilt.debugApi.enabled = !!changes[KEY].newValue;
    });
  } catch (e) {
    /* ignore */
  }
})();
