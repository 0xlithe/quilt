(function () {
  "use strict";

  var Quilt = (window.Quilt = window.Quilt || {});

  if (Quilt._contentListenerInstalled) return;
  Quilt._contentListenerInstalled = true;

  var T = Quilt.MESSAGE_TYPES;
  var SK = Quilt.STORAGE_KEYS;

  if (Quilt.debugApi) {
    try { Quilt.debugApi.loadFromStorage(); } catch (e) { /* storage unavailable */ }
  }

  if (Quilt.storageApi) {
    Quilt.storageApi.get([SK.LAST_STATUS]).then(function (r) {
      var stored = r[SK.LAST_STATUS];
      if (!stored) return;
      var s = stored.state || "";
      if (s === "running" || s === "paused") {
        Quilt.storageApi.set({
          [SK.LAST_STATUS]: { state: "stopped", message: "Page reloaded", time: Date.now() },
        }).catch(function () { /* storage write failed */ });
      }
    }).catch(function () { /* storage read failed */ });
  }

  function onMessage(msg, _sender, sendResponse) {
    if (!msg || typeof msg.type !== "string") {
      sendResponse({ ok: false, error: "bad_message" });
      return false;
    }

    if (msg.type === T.TASK_START) {
      if (!Quilt.taskRunner || !Quilt.isTaskStartPayload) {
        sendResponse({ ok: false, error: "scripts_not_loaded" });
        return false;
      }
      var p = msg.payload || {};
      if (!Quilt.isTaskStartPayload(p)) {
        sendResponse({ ok: false, error: "invalid_payload" });
        return false;
      }

      var norm = Quilt.normalizeTaskStartPayload(p);
      var startFn;

      if (norm.taskType === "like") {
        startFn = Quilt.taskRunner.startLikeTask.bind(Quilt.taskRunner);
      } else if (norm.taskType === "unlike") {
        startFn = Quilt.taskRunner.startUnlikeTask.bind(Quilt.taskRunner);
      } else if (norm.taskType === "unfollow") {
        startFn = Quilt.taskRunner.startUnfollowTask.bind(Quilt.taskRunner);
      } else if (norm.taskType === "follow") {
        startFn = Quilt.taskRunner.startFollowTask.bind(Quilt.taskRunner);
      } else {
        sendResponse({ ok: false, error: "bad_task_type" });
        return false;
      }

      try {
        startFn(norm).catch(function (e) {
          Quilt.debugApi && Quilt.debugApi.log("Task threw:", e);
        });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
      }
      return false;
    }

    if (msg.type === T.TASK_STOP) {
      if (Quilt.taskRunner) Quilt.taskRunner.cancel();
      sendResponse({ ok: true });
      return false;
    }

    if (msg.type === T.TASK_PAUSE) {
      if (Quilt.taskRunner) Quilt.taskRunner.pause();
      sendResponse({ ok: true });
      return false;
    }

    if (msg.type === T.TASK_RESUME) {
      if (Quilt.taskRunner) Quilt.taskRunner.resume();
      sendResponse({ ok: true });
      return false;
    }

    sendResponse({ ok: false, error: "unknown_type" });
    return false;
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    return onMessage(msg, sender, sendResponse);
  });
})();
