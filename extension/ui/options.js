(function () {
  "use strict";

  var DEBUG_KEY = "quilt_debug_enabled";
  var SIDEBAR_KEY = "quilt_sidebar_on_click";

  var cbDebug = document.getElementById("debug");
  var cbSidebar = document.getElementById("sidebar");

  chrome.storage.local.get([DEBUG_KEY, SIDEBAR_KEY], function (r) {
    cbDebug.checked = !!r[DEBUG_KEY];
    cbSidebar.checked = r[SIDEBAR_KEY] !== false;
  });

  cbDebug.addEventListener("change", function () {
    chrome.storage.local.set({ [DEBUG_KEY]: cbDebug.checked });
  });

  cbSidebar.addEventListener("change", function () {
    chrome.storage.local.set({ [SIDEBAR_KEY]: cbSidebar.checked });
  });
})();
