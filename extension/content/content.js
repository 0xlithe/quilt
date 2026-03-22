(function () {
  "use strict";

  var Quilt = (window.Quilt = window.Quilt || {});

  if (Quilt._contentListenerInstalled) return;
  Quilt._contentListenerInstalled = true;

  var T = Quilt.MESSAGE_TYPES;

  if (Quilt.debugApi) Quilt.debugApi.loadFromStorage();

  if (Quilt.storageApi) {
    Quilt.storageApi.get(["quilt_last_status"]).then(function (r) {
      var stored = r.quilt_last_status;
      if (!stored) return;
      var s = stored.state || "";
      if (s === "running" || s === "paused") {
        Quilt.storageApi.set({
          quilt_last_status: { state: "stopped", message: "Page reloaded", time: Date.now() },
        });
      }
    });
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

      if (norm.taskType === "like") {
        Quilt.taskRunner.startLikeTask(norm);
      } else if (norm.taskType === "unlike") {
        Quilt.taskRunner.startUnlikeTask(norm);
      } else if (norm.taskType === "unfollow") {
        Quilt.taskRunner.startUnfollowTask(norm);
      } else if (norm.taskType === "follow") {
        Quilt.taskRunner.startFollowTask(norm);
      } else {
        sendResponse({ ok: false, error: "bad_task_type" });
        return false;
      }
      sendResponse({ ok: true });
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
