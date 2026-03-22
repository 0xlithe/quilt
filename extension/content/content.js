(function () {
  "use strict";

  var Quilt = (window.Quilt = window.Quilt || {});
  var T = Quilt.MESSAGE_TYPES;

  Quilt.debugApi.loadFromStorage().then(function () {
    Quilt.domActionsApi.installFeedObserver();
  });

  function onMessage(msg, _sender, sendResponse) {
    if (!msg || typeof msg.type !== "string") {
      sendResponse({ ok: false, error: "bad_message" });
      return false;
    }

    if (msg.type === T.TASK_START) {
      var p = msg.payload || {};
      if (!Quilt.isTaskStartPayload(p)) {
        sendResponse({ ok: false, error: "invalid_payload" });
        return false;
      }

      var norm = Quilt.normalizeTaskStartPayload(p);

      if (norm.taskType === "like") {
        Quilt.taskRunner.startLikeTask(norm);
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
      Quilt.taskRunner.cancel();
      sendResponse({ ok: true });
      return false;
    }

    if (msg.type === T.TASK_PAUSE) {
      Quilt.taskRunner.pause();
      sendResponse({ ok: true });
      return false;
    }

    if (msg.type === T.TASK_RESUME) {
      Quilt.taskRunner.resume();
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
