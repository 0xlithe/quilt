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
  };

  if (el.maxPostAmount) el.maxPostAmount.value = String(TD.maxPostAmount);
  if (el.delayMin) el.delayMin.value = String(TD.delayMinMs);
  if (el.delayMax) el.delayMax.value = String(TD.delayMaxMs);
  if (el.longPauseMin) el.longPauseMin.value = String(TD.longPauseMinMs);
  if (el.longPauseMax) el.longPauseMax.value = String(TD.longPauseMaxMs);

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
      el.status.textContent = "";
      return;
    }
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

  chrome.storage.local.get([SK.DEBUG_ENABLED], function (r) {
    _debugOn = !!r[SK.DEBUG_ENABLED];
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== "local" || !changes[SK.DEBUG_ENABLED]) return;
    _debugOn = !!changes[SK.DEBUG_ENABLED].newValue;
    if (!_debugOn) {
      el.status.style.opacity = "0";
      el.status.textContent = "";
    } else {
      chrome.storage.local.get([SK.LAST_STATUS], function (r) {
        applyStoredStatus(r[SK.LAST_STATUS]);
      });
    }
  });

  var delayWarning = document.getElementById("delayWarning");
  function updateDelayWarning() {
    if (!delayWarning || !el.delayMin) return;
    var val = parseInt(el.delayMin.value, 10) || 0;
    delayWarning.style.display = (val > 0 && val < 4000) ? "block" : "none";
  }
  if (el.delayMin) el.delayMin.addEventListener("input", updateDelayWarning);

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

  chrome.storage.local.get([SK.DEBUG_ENABLED, SK.LAST_STATUS], function (r) {
    if (r[SK.DEBUG_ENABLED]) applyStoredStatus(r[SK.LAST_STATUS]);
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== "local" || !changes[SK.LAST_STATUS]) return;
    if (isDebugOn()) applyStoredStatus(changes[SK.LAST_STATUS].newValue);
  });
})();
