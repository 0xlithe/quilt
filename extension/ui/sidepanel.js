(function () {
  "use strict";

  var Quilt = self.Quilt;
  var T = Quilt.MESSAGE_TYPES;
  var SK = Quilt.STORAGE_KEYS;
  var TD = Quilt.TASK_DEFAULTS;

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
    timerPanel: $("timerPanel"),
    elapsed: $("elapsed"),
    progressVerb: $("progressVerb"),
    progressCount: $("progressCount"),
    progressFill: $("progressFill"),
    idleState: $("idleState"),
  };

  if (el.maxPostAmount) el.maxPostAmount.value = String(TD.maxPostAmount);
  if (el.delayMin) el.delayMin.value = String(TD.delayMinMs);
  if (el.delayMax) el.delayMax.value = String(TD.delayMaxMs);
  if (el.longPauseMin) el.longPauseMin.value = String(TD.longPauseMinMs);
  if (el.longPauseMax) el.longPauseMax.value = String(TD.longPauseMaxMs);

  var VERB_MAP = {
    follow: "Following",
    unfollow: "Unfollowing",
    like: "Liking",
    unlike: "Unliking",
  };

  var _timerInterval = null;
  var _taskStartedAt = 0;
  var _taskActive = false;

  function getVal(mdEl) {
    if (!mdEl) return "";
    return mdEl.value != null ? String(mdEl.value) : "";
  }

  function getInt(mdEl) {
    return parseInt(getVal(mdEl), 10);
  }

  function formatElapsed(ms) {
    var totalSec = Math.floor(ms / 1000);
    var m = Math.floor(totalSec / 60);
    var s = totalSec % 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }

  function tickTimer() {
    if (!_taskStartedAt) return;
    el.elapsed.textContent = formatElapsed(Date.now() - _taskStartedAt);
  }

  function startTimer(startedAt) {
    _taskStartedAt = startedAt || Date.now();
    _taskActive = true;
    tickTimer();
    if (_timerInterval) clearInterval(_timerInterval);
    _timerInterval = setInterval(tickTimer, 1000);
    el.timerPanel.classList.remove("hidden");
    el.idleState.classList.add("hidden");
  }

  function stopTimer() {
    _taskActive = false;
    if (_timerInterval) {
      clearInterval(_timerInterval);
      _timerInterval = null;
    }
  }

  function showIdle() {
    stopTimer();
    el.timerPanel.classList.add("hidden");
    el.idleState.classList.remove("hidden");
    el.elapsed.textContent = "00:00";
    el.progressFill.style.width = "0%";
    el.progressCount.textContent = "0 / 0";
  }

  function updateProgress(completed, maxActions, taskType) {
    var c = typeof completed === "number" ? completed : 0;
    var m = typeof maxActions === "number" && maxActions > 0 ? maxActions : 0;
    el.progressCount.textContent = c + " / " + m;
    el.progressFill.style.width = m > 0 ? Math.min(100, (c / m) * 100) + "%" : "0%";
    if (taskType && VERB_MAP[taskType]) {
      el.progressVerb.textContent = VERB_MAP[taskType];
    }
  }

  function setStatus(text, detail) {
    el.status.style.opacity = "0";
    setTimeout(function () {
      el.status.textContent = "";
      var strong = document.createElement("strong");
      strong.textContent = text || "";
      el.status.appendChild(strong);
      if (detail) {
        el.status.appendChild(document.createElement("br"));
        el.status.appendChild(document.createTextNode(detail));
      }
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
      var label = VERB_MAP[p.taskType] || "Task";
      setStatus("Started", label + " active on this tab.");
      startTimer(Date.now());
      updateProgress(0, getInt(el.maxPostAmount), p.taskType);
    });
  });

  el.btnStop.addEventListener("click", function () {
    send(T.TASK_STOP, {}).then(function (r) {
      setStatus(r.ok ? "Stopped" : "Stop failed", r.error || "");
      if (r.ok) showIdle();
    });
  });

  function parseProgressFromMessage(msg) {
    if (!msg || typeof msg !== "string") return null;
    var m = msg.match(/(\d+)\s*\/\s*(\d+)/);
    if (!m) return null;
    return { completed: parseInt(m[1], 10), total: parseInt(m[2], 10) };
  }

  function applyStatusData(data) {
    if (!data) return;
    var state = data.state || "";
    var msg = data.message || "";

    setStatus(state, msg);

    if (state === "running") {
      if (!_taskActive) {
        startTimer(data.startedAt || Date.now());
      }
      var completed = typeof data.completed === "number" ? data.completed : null;
      var maxActions = typeof data.maxActions === "number" ? data.maxActions : null;

      if (completed == null || maxActions == null) {
        var parsed = parseProgressFromMessage(msg);
        if (parsed) {
          if (completed == null) completed = parsed.completed;
          if (maxActions == null) maxActions = parsed.total;
        }
      }

      if (completed != null && maxActions != null) {
        updateProgress(completed, maxActions, data.taskType);
      }
    } else if (state === "completed" || state === "cancelled" || state === "stopped" || state === "error") {
      var finalCompleted = typeof data.completed === "number" ? data.completed : null;
      var finalMax = typeof data.maxActions === "number" ? data.maxActions : null;
      if (finalCompleted == null || finalMax == null) {
        var fp = parseProgressFromMessage(msg);
        if (fp) {
          if (finalCompleted == null) finalCompleted = fp.completed;
          if (finalMax == null) finalMax = fp.total;
        }
      }
      if (finalCompleted != null && finalMax != null) {
        updateProgress(finalCompleted, finalMax, data.taskType);
      }
      stopTimer();
    }
  }

  chrome.storage.local.get([SK.LAST_STATUS], function (r) {
    var stored = r[SK.LAST_STATUS];
    if (!stored) {
      showIdle();
      return;
    }
    var s = stored.state || "";
    if (s === "running" || s === "paused") {
      applyStatusData(stored);
    } else {
      showIdle();
      applyStatusData(stored);
    }
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== "local" || !changes[SK.LAST_STATUS]) return;
    applyStatusData(changes[SK.LAST_STATUS].newValue);
  });
})();
