importScripts("../messaging/messaging.js");

(function () {
  "use strict";

  var Quilt = self.Quilt;
  var T = Quilt.MESSAGE_TYPES;

  var ALL_CONTENT_SCRIPTS = [
    "messaging/messaging.js",
    "storage/storage.js",
    "content/debug.js",
    "safety/delay.js",
    "safety/humanizer.js",
    "safety/sessionManager.js",
    "safety/cooldown.js",
    "safety/rateLimiter.js",
    "core/scheduler.js",
    "core/taskStatusShared.js",
    "content/followWireShared.js",
    "content/domActions.js",
    "core/taskRunner.js",
    "content/badges.js",
    "content/content.js",
  ];

  var MAIN_WORLD_SCRIPTS = [
    "content/followWireShared.js",
    "content/pageWorldFollowTap.js",
  ];

  var _injectedTabs = new Set();
  var SIDEBAR_KEY = "quilt_sidebar_on_click";

  chrome.tabs.onRemoved.addListener(function (tabId) {
    _injectedTabs.delete(tabId);
  });

  function applySidebarPref(enabled) {
    try {
      if (enabled) {
        chrome.action.setPopup({ popup: "" });
        chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
      } else {
        chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
        chrome.action.setPopup({ popup: "ui/popup.html" });
      }
    } catch (e) {
      /* sidePanel API unavailable */
    }
  }

  chrome.storage.local.get([SIDEBAR_KEY], function (r) {
    applySidebarPref(r[SIDEBAR_KEY] !== false);
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== "local" || !changes[SIDEBAR_KEY]) return;
    applySidebarPref(changes[SIDEBAR_KEY].newValue !== false);
  });

  function findXTab(callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var err = chrome.runtime.lastError;
      if (err) {
        callback(null, err.message);
        return;
      }
      var tab = tabs && tabs[0];
      if (!tab || !tab.id) {
        callback(null, "no_active_tab");
        return;
      }
      var u = tab.url || "";
      var ok = false;
      try {
        var parsed = new URL(u);
        ok =
          parsed.protocol === "https:" &&
          (parsed.hostname === "x.com" || parsed.hostname === "twitter.com");
      } catch (e) {
        ok = false;
      }
      if (!ok) {
        callback(null, "not_x_com");
        return;
      }
      callback(tab.id, null);
    });
  }

  function injectTaskScripts(tabId, done) {
    if (_injectedTabs.has(tabId)) {
      done(null);
      return;
    }
    chrome.scripting.executeScript(
      {
        target: { tabId: tabId, allFrames: false },
        files: ALL_CONTENT_SCRIPTS,
      },
      function () {
        var err = chrome.runtime.lastError;
        if (err) {
          done(err.message || "task_script_inject_failed");
          return;
        }
        _injectedTabs.add(tabId);
        done(null);
      }
    );
  }

  function injectMainWorldScripts(tabId, done) {
    chrome.scripting.executeScript(
      {
        target: { tabId: tabId, allFrames: false },
        world: "MAIN",
        files: MAIN_WORLD_SCRIPTS,
      },
      function () {
        var err = chrome.runtime.lastError;
        done(err ? err.message || "main_world_inject_failed" : null);
      }
    );
  }

  function injectAllForTask(tabId, done) {
    injectTaskScripts(tabId, function (err) {
      if (err) {
        done(err);
        return;
      }
      injectMainWorldScripts(tabId, done);
    });
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg || typeof msg.type !== "string") {
      sendResponse({ ok: false, error: "bad_message" });
      return false;
    }

    if (msg.type === T.TASK_START || msg.type === T.TASK_STOP || msg.type === T.TASK_PAUSE || msg.type === T.TASK_RESUME) {
      findXTab(function (tabId, err) {
        if (err) {
          sendResponse({ ok: false, error: err });
          return;
        }
        function forwardToContent() {
          chrome.tabs.sendMessage(tabId, msg, function (res) {
            var le = chrome.runtime.lastError;
            if (le) {
              sendResponse({ ok: false, error: le.message });
              return;
            }
            sendResponse(res || { ok: true });
          });
        }
        if (msg.type === T.TASK_START) {
          injectAllForTask(tabId, function (injectErr) {
            if (injectErr) {
              sendResponse({ ok: false, error: injectErr });
              return;
            }
            forwardToContent();
          });
        } else {
          forwardToContent();
        }
      });
      return true;
    }

    if (msg.type === T.TASK_STATUS) {
      var p = msg.payload || {};
      var statusObj = {
        state: p.state,
        message: p.message,
        time: Date.now(),
      };
      if (p.taskType) statusObj.taskType = p.taskType;
      if (p.startedAt) statusObj.startedAt = p.startedAt;
      if (typeof p.completed === "number") statusObj.completed = p.completed;
      if (typeof p.maxActions === "number") statusObj.maxActions = p.maxActions;
      chrome.storage.local.set(
        { quilt_last_status: statusObj },
        function () {
          void chrome.runtime.lastError;
        }
      );
      sendResponse({ ok: true });
      return false;
    }

    sendResponse({ ok: false, error: "unknown_type" });
    return false;
  });
})();
