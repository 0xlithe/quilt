(function () {
  "use strict";

  var Quilt = (window.Quilt = window.Quilt || {});
  var T = Quilt.MESSAGE_TYPES;

  var BADGE_DEFAULTS = {
    maxPostAmount: 50,
    delayMinMs: 4000,
    delayMaxMs: 8000,
    longPauseEvery: 0,
    longPauseMinMs: 15000,
    longPauseMaxMs: 45000,
  };

  var ICON_HEART =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';

  var ICON_PLUS_CIRCLE =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>';

  var ICON_MINUS_CIRCLE =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>';

  var _activeTask = null;
  var _hideTimer = null;
  var _lastBadgeClickTime = 0;

  function injectStyles() {
    var style = document.createElement("style");
    style.textContent = [
      "#quilt-badges {",
      "  position: fixed;",
      "  top: 12px;",
      "  right: 12px;",
      "  z-index: 2147483647;",
      "  display: flex;",
      "  flex-direction: column;",
      "  align-items: center;",
      "  pointer-events: none;",
      "  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;",
      "}",
      ".quilt-badge-bar {",
      "  display: flex;",
      "  gap: 8px;",
      "  pointer-events: auto;",
      "}",
      ".quilt-badge-btn {",
      "  width: 36px;",
      "  height: 36px;",
      "  border-radius: 50%;",
      "  background: #000;",
      "  border: 1.5px solid rgba(255,255,255,0.25);",
      "  color: #fff;",
      "  cursor: pointer;",
      "  display: flex;",
      "  align-items: center;",
      "  justify-content: center;",
      "  padding: 0;",
      "  transition: border-color 0.15s, opacity 0.15s, transform 0.1s;",
      "  opacity: 0.7;",
      "}",
      ".quilt-badge-btn:hover {",
      "  opacity: 1;",
      "  transform: scale(1.08);",
      "}",
      ".quilt-badge-btn.quilt-active {",
      "  border-color: #fff;",
      "  opacity: 1;",
      "}",
      ".quilt-badge-status {",
      "  margin-top: 6px;",
      "  font-size: 11px;",
      "  color: #fff;",
      "  text-align: center;",
      "  max-width: 180px;",
      "  line-height: 1.35;",
      "  text-shadow: 0 1px 4px rgba(0,0,0,0.7);",
      "  pointer-events: none;",
      "  opacity: 0;",
      "  transition: opacity 0.25s;",
      "}",
      ".quilt-badge-status.quilt-visible {",
      "  opacity: 1;",
      "}",
    ].join("\n");
    document.head.appendChild(style);
  }

  function buildBadgeBar() {
    var container = document.createElement("div");
    container.id = "quilt-badges";

    var bar = document.createElement("div");
    bar.className = "quilt-badge-bar";

    var tasks = [
      { task: "like", icon: ICON_HEART, title: "Like" },
      { task: "follow", icon: ICON_PLUS_CIRCLE, title: "Follow All" },
      { task: "unfollow", icon: ICON_MINUS_CIRCLE, title: "Unfollow" },
    ];

    for (var i = 0; i < tasks.length; i++) {
      var btn = document.createElement("button");
      btn.className = "quilt-badge-btn";
      btn.setAttribute("data-quilt-task", tasks[i].task);
      btn.setAttribute("title", tasks[i].title);
      btn.innerHTML = tasks[i].icon;
      bar.appendChild(btn);
    }

    var status = document.createElement("div");
    status.className = "quilt-badge-status";

    container.appendChild(bar);
    container.appendChild(status);
    document.body.appendChild(container);

    return { container: container, bar: bar, status: status };
  }

  function sendMessage(type, payload) {
    return new Promise(function (resolve) {
      try {
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
      } catch (e) {
        resolve({ ok: false, error: String(e.message || e) });
      }
    });
  }

  function friendlyStatus(data) {
    if (!data) return "";
    var state = data.state || "";
    var msg = (data.message || "").toLowerCase();

    if (state === "completed") return "All done!";
    if (state === "stopped") return "Finished";
    if (state === "cancelled") return "Stopped";
    if (state === "paused") return "Paused";
    if (state === "error") {
      if (msg.indexOf("connect") !== -1) return "Can't connect";
      return "Something went wrong";
    }

    if (state === "running") {
      if (msg.indexOf("rate limit") !== -1) {
        var minMatch =
          data.message && data.message.match(/(\d+)\s*min/);
        if (minMatch)
          return "Rate limited \u2014 " + minMatch[1] + " min left";
        return "Rate limited, please wait\u2026";
      }
      if (msg.indexOf("cooling down") !== -1) return "Taking a break\u2026";
      if (msg.indexOf("scrolling") !== -1) return "Looking for more\u2026";
      if (msg.indexOf("started") !== -1) return "Starting\u2026";
      if (msg.indexOf("resumed") !== -1) return "Resumed";

      var progress =
        data.message &&
        data.message.match(/^(Follow|Like|Unfollow)\s+(\d+)\s*\/\s*(\d+)/i);
      if (progress) {
        var verb =
          progress[1].toLowerCase() === "follow"
            ? "Following"
            : progress[1].toLowerCase() === "like"
              ? "Liking"
              : "Unfollowing";
        return verb + " " + progress[2] + " / " + progress[3];
      }

      if (msg.indexOf("attempting") !== -1 || msg.indexOf("direct") !== -1)
        return "Working\u2026";
      if (msg.indexOf("verifying") !== -1 || msg.indexOf("waiting for") !== -1)
        return "Confirming\u2026";
      if (msg.indexOf("not yet confirmed") !== -1 || msg.indexOf("failed") !== -1)
        return "Retrying\u2026";

      return "Working\u2026";
    }

    return "";
  }

  function guessActiveTaskFromMessage(msg) {
    if (!msg) return null;
    var raw = (msg.message || "").toLowerCase();
    var state = msg.state || "";
    if (
      state === "completed" ||
      state === "stopped" ||
      state === "cancelled" ||
      state === "error"
    )
      return null;
    if (raw.indexOf("follow") !== -1 && raw.indexOf("unfollow") === -1)
      return "follow";
    if (raw.indexOf("unfollow") !== -1) return "unfollow";
    if (raw.indexOf("like") !== -1 || raw.indexOf("liking") !== -1)
      return "like";
    return _activeTask;
  }

  function init() {
    if (document.getElementById("quilt-badges")) return;

    injectStyles();
    var ui = buildBadgeBar();

    function setStatusText(text) {
      ui.status.textContent = text || "";
      if (text) {
        ui.status.classList.add("quilt-visible");
        clearTimeout(_hideTimer);
        _hideTimer = setTimeout(function () {
          ui.status.classList.remove("quilt-visible");
        }, 8000);
      } else {
        ui.status.classList.remove("quilt-visible");
      }
    }

    function updateActiveHighlight(task) {
      _activeTask = task;
      var btns = ui.bar.querySelectorAll(".quilt-badge-btn");
      for (var i = 0; i < btns.length; i++) {
        var t = btns[i].getAttribute("data-quilt-task");
        if (t === task) {
          btns[i].classList.add("quilt-active");
        } else {
          btns[i].classList.remove("quilt-active");
        }
      }
    }

    function applyStatus(data) {
      if (!data) return;
      var state = data.state || "";
      var recentClick = Date.now() - _lastBadgeClickTime < 2000;
      if (recentClick && (state === "cancelled" || state === "stopped")) return;

      var text = friendlyStatus(data);
      setStatusText(text);

      var task = guessActiveTaskFromMessage(data);
      updateActiveHighlight(task);
    }

    ui.bar.addEventListener("click", function (ev) {
      var btn = ev.target.closest(".quilt-badge-btn");
      if (!btn) return;
      var task = btn.getAttribute("data-quilt-task");
      if (!task) return;

      _lastBadgeClickTime = Date.now();

      if (_activeTask === task) {
        sendMessage(T.TASK_STOP, {}).then(function () {
          updateActiveHighlight(null);
          setStatusText("Stopped");
        });
        return;
      }

      var payload = {};
      for (var k in BADGE_DEFAULTS) {
        if (Object.prototype.hasOwnProperty.call(BADGE_DEFAULTS, k)) {
          payload[k] = BADGE_DEFAULTS[k];
        }
      }
      payload.taskType = task;
      payload.task = task;

      updateActiveHighlight(task);
      setStatusText("Starting\u2026");

      sendMessage(T.TASK_START, payload).then(function (r) {
        if (!r.ok) {
          var errText =
            r.error && r.error.indexOf("not_x_com") !== -1
              ? "Open an x.com tab first"
              : r.error && r.error.indexOf("connect") !== -1
                ? "Can't connect"
                : "Couldn't start";
          setStatusText(errText);
          updateActiveHighlight(null);
        }
      });
    });

    chrome.storage.local.get(["quilt_last_status"], function (r) {
      var stored = r.quilt_last_status;
      if (!stored) return;
      var s = stored.state || "";
      if (s === "running" || s === "paused") {
        chrome.storage.local.set({
          quilt_last_status: { state: "stopped", message: "Page reloaded", time: Date.now() },
        });
        return;
      }
      applyStatus(stored);
    });

    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== "local" || !changes.quilt_last_status) return;
      applyStatus(changes.quilt_last_status.newValue);
    });
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
