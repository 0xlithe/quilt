importScripts("../messaging/messaging.js");

(function () {
  "use strict";

  var Quilt = self.Quilt;
  var T = Quilt.MESSAGE_TYPES;

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

  /**
   * Friendship tasks need MAIN-world hooks for create/destroy requests; inject only
   * on Start so normal browsing never replaces fetch/XHR.
   */
  function injectMainFollowWireIfFollow(msg, tabId, done) {
    if (msg.type !== T.TASK_START) {
      done(null);
      return;
    }
    var p = msg.payload || {};
    var mode = String(p.taskType != null ? p.taskType : p.task != null ? p.task : "follow")
      .trim()
      .toLowerCase();
    if (mode !== "follow" && mode !== "unfollow" && mode !== "like") {
      done(null);
      return;
    }
    chrome.scripting.executeScript(
      {
        target: { tabId: tabId, allFrames: false },
        world: "MAIN",
        files: ["content/followWireShared.js", "content/pageWorldFollowTap.js"],
      },
      function () {
        var err = chrome.runtime.lastError;
        done(err ? err.message || "follow_wire_inject_failed" : null);
      }
    );
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
          injectMainFollowWireIfFollow(msg, tabId, function (injectErr) {
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
      chrome.storage.local.set(
        {
          quilt_last_status: {
            state: msg.payload && msg.payload.state,
            message: msg.payload && msg.payload.message,
            time: Date.now(),
          },
        },
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
