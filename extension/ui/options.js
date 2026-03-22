(function () {
  "use strict";

  var Quilt = self.Quilt;
  var SK = Quilt.STORAGE_KEYS;

  var cbDebug = document.getElementById("debug");
  var cbSidebar = document.getElementById("sidebar");

  chrome.storage.local.get([SK.DEBUG_ENABLED, SK.SIDEBAR_ON_CLICK], function (r) {
    cbDebug.checked = !!r[SK.DEBUG_ENABLED];
    cbSidebar.checked = r[SK.SIDEBAR_ON_CLICK] !== false;
  });

  cbDebug.addEventListener("change", function () {
    chrome.storage.local.set({ [SK.DEBUG_ENABLED]: cbDebug.checked });
  });

  cbSidebar.addEventListener("change", function () {
    chrome.storage.local.set({ [SK.SIDEBAR_ON_CLICK]: cbSidebar.checked });
  });
})();
