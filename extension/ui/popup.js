(function () {
  "use strict";

  var Quilt = self.Quilt;
  var T = Quilt.MESSAGE_TYPES;
  var DEBUG_KEY = "quilt_debug_enabled";

  function $(id) { return document.getElementById(id); }

  var el = {
    taskType: $("taskType"),
    maxPostAmount: $("maxPostAmount"),
    delayMin: $("delayMin"),
    delayMax: $("delayMax"),
    longPauseEvery: $("longPauseEvery"),
    longPauseMin: $("longPauseMin"),
    longPauseMax: $("longPauseMax"),
    status: $("status"),
    btnStart: $("btnStart"),
    btnStop: $("btnStop"),
  };

  function getVal(mdEl) {
    if (!mdEl) return "";
    return mdEl.value != null ? String(mdEl.value) : "";
  }

  function getInt(mdEl) {
    return parseInt(getVal(mdEl), 10);
  }

  var _debugOn = false;

  function isDebugOn() {
    return _debugOn;
  }

  function setStatus(text, detail) {
    if (!isDebugOn()) {
      el.status.style.opacity = "0";
      el.status.innerHTML = "";
      return;
    }
    el.status.style.opacity = "0";
    setTimeout(function () {
      el.status.innerHTML =
        "<strong>" + (text || "") + "</strong>" + (detail ? "<br />" + detail : "");
      el.status.style.opacity = "1";
    }, 100);
  }

  function readPayload() {
    var every = getInt(el.longPauseEvery);
    if (!Number.isFinite(every) || every < 0) every = 0;
    var mode = getVal(el.taskType).trim().toLowerCase() || "follow";
    if (mode !== "like" && mode !== "unlike" && mode !== "follow" && mode !== "unfollow") mode = "follow";
    return {
      taskType: mode,
      task: mode,
      maxPostAmount: getInt(el.maxPostAmount),
      delayMinMs: getInt(el.delayMin),
      delayMaxMs: getInt(el.delayMax),
      longPauseEvery: every,
      longPauseMinMs: getInt(el.longPauseMin),
      longPauseMaxMs: getInt(el.longPauseMax),
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
    _debugOn = !!r[DEBUG_KEY];
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== "local" || !changes[DEBUG_KEY]) return;
    _debugOn = !!changes[DEBUG_KEY].newValue;
    if (!_debugOn) {
      el.status.style.opacity = "0";
      el.status.innerHTML = "";
    } else {
      chrome.storage.local.get(["quilt_last_status"], function (r) {
        applyStoredStatus(r.quilt_last_status);
      });
    }
  });

  el.btnStart.addEventListener("click", function () {
    var p = readPayload();
    if (!Quilt.isTaskStartPayload(p)) {
      setStatus("Invalid settings", "Check delays and max actions.");
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
          : p.taskType === "unlike"
            ? "Unlike"
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

  function applyStoredStatus(data) {
    if (!data) return;
    var msg = data.message || "";
    setStatus(data.state || "\u2014", msg);
  }

  chrome.storage.local.get([DEBUG_KEY, "quilt_last_status"], function (r) {
    if (r[DEBUG_KEY]) applyStoredStatus(r.quilt_last_status);
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== "local" || !changes.quilt_last_status) return;
    if (isDebugOn()) applyStoredStatus(changes.quilt_last_status.newValue);
  });
})();
