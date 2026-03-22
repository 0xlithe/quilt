(function () {
  "use strict";

  var Quilt = (window.Quilt = window.Quilt || {});

  var SK = Quilt.STORAGE_KEYS;

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
      return Quilt.storageApi.set({ [SK.DEBUG_ENABLED]: Quilt.debugApi.enabled });
    },

    loadFromStorage: function () {
      return Quilt.storageApi.get([SK.DEBUG_ENABLED]).then(function (r) {
        Quilt.debugApi.enabled = !!r[SK.DEBUG_ENABLED];
      });
    },
  };

  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== "local" || !changes[SK.DEBUG_ENABLED]) return;
      Quilt.debugApi.enabled = !!changes[SK.DEBUG_ENABLED].newValue;
    });
  } catch (e) {
    /* ignore */
  }
})();
