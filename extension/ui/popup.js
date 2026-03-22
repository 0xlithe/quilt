(function () {
  "use strict";

  var Quilt = self.Quilt;
  var T = Quilt.MESSAGE_TYPES;
  var DEBUG_KEY = "quilt_debug_enabled";

  var el = {
    taskType: document.getElementById("taskType"),
    maxPostAmount: document.getElementById("maxPostAmount"),
    delayMin: document.getElementById("delayMin"),
    delayMax: document.getElementById("delayMax"),
    longPauseEvery: document.getElementById("longPauseEvery"),
    longPauseMin: document.getElementById("longPauseMin"),
    longPauseMax: document.getElementById("longPauseMax"),
    debug: document.getElementById("debug"),
    status: document.getElementById("status"),
    btnStart: document.getElementById("btnStart"),
    btnStop: document.getElementById("btnStop"),
    btnPause: document.getElementById("btnPause"),
    btnResume: document.getElementById("btnResume"),
  };

  function setStatus(text, detail) {
    el.status.innerHTML =
      "<strong>" + (text || "") + "</strong>" + (detail ? "<br />" + detail : "");
  }

  function readPayload() {
    var every = parseInt(el.longPauseEvery.value, 10);
    if (!Number.isFinite(every) || every < 0) every = 0;
    var mode = (el.taskType && el.taskType.value
      ? String(el.taskType.value)
      : "follow"
    )
      .trim()
      .toLowerCase();
    if (mode !== "like" && mode !== "follow" && mode !== "unfollow") mode = "follow";
    return {
      taskType: mode,
      task: mode,
      maxPostAmount: parseInt(el.maxPostAmount.value, 10),
      delayMinMs: parseInt(el.delayMin.value, 10),
      delayMaxMs: parseInt(el.delayMax.value, 10),
      longPauseEvery: every,
      longPauseMinMs: parseInt(el.longPauseMin.value, 10),
      longPauseMaxMs: parseInt(el.longPauseMax.value, 10),
    };
  }

  function send(type, payload) {
    return new Promise(function (resolve) {
      chrome.runtime.sendMessage(
        Quilt.createMessage(type, payload),
        function (res) {
          var err = chrome.runtime.lastError;
          if (err) {
            resolve({ ok: false, error: err.message });
            return;
          }
          resolve(res || { ok: true });
        }
      );
    });
  }

  chrome.storage.local.get([DEBUG_KEY], function (r) {
    el.debug.checked = !!r[DEBUG_KEY];
  });

  el.debug.addEventListener("change", function () {
    chrome.storage.local.set({ [DEBUG_KEY]: el.debug.checked });
  });

  el.btnStart.addEventListener("click", function () {
    var p = readPayload();
    if (!Quilt.isTaskStartPayload(p)) {
      setStatus("Invalid settings", "Check delays and max post amount.");
      return;
    }
    setStatus("Starting\u2026", "");
    send(T.TASK_START, p).then(function (r) {
      if (!r.ok) {
        setStatus("Could not start", r.error || "");
        return;
      }
      var label =
        p.taskType === "like"
          ? "Like"
          : p.taskType === "unfollow"
            ? "Unfollow"
            : "Follow";
      setStatus("Started: " + label, "Active on this x.com tab.");
    });
  });

  el.btnStop.addEventListener("click", function () {
    send(T.TASK_STOP, {}).then(function (r) {
      setStatus(r.ok ? "Stop sent" : "Stop failed", r.error || "");
    });
  });

  el.btnPause.addEventListener("click", function () {
    send(T.TASK_PAUSE, {}).then(function (r) {
      setStatus(r.ok ? "Pause sent" : "Pause failed", r.error || "");
    });
  });

  el.btnResume.addEventListener("click", function () {
    send(T.TASK_RESUME, {}).then(function (r) {
      setStatus(r.ok ? "Resume sent" : "Resume failed", r.error || "");
    });
  });

  function applyStoredStatus(data) {
    if (!data) return;
    var msg = data.message || "";
    setStatus(data.state || "—", msg);
  }

  chrome.storage.local.get(["quilt_last_status"], function (r) {
    applyStoredStatus(r.quilt_last_status);
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== "local" || !changes.quilt_last_status) return;
    applyStoredStatus(changes.quilt_last_status.newValue);
  });
})();
