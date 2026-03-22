(function (global) {
  "use strict";

  var Quilt = (global.Quilt = global.Quilt || {});

  Quilt.MESSAGE_TYPES = {
    TASK_START: "TASK_START",
    TASK_STOP: "TASK_STOP",
    TASK_STATUS: "TASK_STATUS",
    TASK_PAUSE: "TASK_PAUSE",
    TASK_RESUME: "TASK_RESUME",
  };

  Quilt.STORAGE_KEYS = {
    LAST_STATUS: "quilt_last_status",
    DEBUG_ENABLED: "quilt_debug_enabled",
    SIDEBAR_ON_CLICK: "quilt_sidebar_on_click",
  };

  Quilt.TASK_DEFAULTS = {
    maxPostAmount: 50,
    delayMinMs: 4000,
    delayMaxMs: 8000,
    longPauseEvery: 0,
    longPauseMinMs: 15000,
    longPauseMaxMs: 45000,
  };

  /**
   * @returns {"follow"|"unfollow"|"like"|null} null = invalid explicit value
   */
  function resolveTaskType(payload) {
    if (!payload || typeof payload !== "object") return "follow";
    var a =
      payload.taskType != null ? String(payload.taskType).trim().toLowerCase() : "";
    var b =
      payload.task != null ? String(payload.task).trim().toLowerCase() : "";
    if (a && b && a !== b) return null;
    var v = a || b;
    if (!v) return "follow";
    if (v === "like" || v === "unlike" || v === "follow" || v === "unfollow") return v;
    return null;
  }

  function pickMaxPostAmount(payload) {
    if (
      typeof payload.maxPostAmount === "number" &&
      Number.isFinite(payload.maxPostAmount) &&
      payload.maxPostAmount >= 1
    ) {
      return payload.maxPostAmount;
    }
    if (
      typeof payload.maxActions === "number" &&
      Number.isFinite(payload.maxActions) &&
      payload.maxActions >= 1
    ) {
      return payload.maxActions;
    }
    if (
      typeof payload.maxFollows === "number" &&
      Number.isFinite(payload.maxFollows) &&
      payload.maxFollows >= 1
    ) {
      return payload.maxFollows;
    }
    return undefined;
  }

  Quilt.isTaskStartPayload = function (payload) {
    if (!payload || typeof payload !== "object") return false;
    var minD = payload.delayMinMs;
    var maxD = payload.delayMaxMs;
    if (typeof minD !== "number" || typeof maxD !== "number") return false;
    if (!Number.isFinite(minD) || !Number.isFinite(maxD)) return false;
    if (minD < 0 || maxD < minD) return false;

    var maxA = pickMaxPostAmount(payload);
    if (maxA === undefined) return false;

    if (resolveTaskType(payload) === null) return false;

    var every = payload.longPauseEvery;
    if (typeof every === "number" && every > 0) {
      var lmin = payload.longPauseMinMs;
      var lmax = payload.longPauseMaxMs;
      if (typeof lmin !== "number" || typeof lmax !== "number") return false;
      if (!Number.isFinite(lmin) || !Number.isFinite(lmax)) return false;
      if (lmin < 0 || lmax < lmin) return false;
    }

    if (typeof payload.maxPerDay === "number") {
      if (!Number.isFinite(payload.maxPerDay) || payload.maxPerDay < 1) {
        return false;
      }
    }

    return true;
  };

  Quilt.normalizeTaskStartPayload = function (payload) {
    var maxA = pickMaxPostAmount(payload);
    var every =
      typeof payload.longPauseEvery === "number" &&
      Number.isFinite(payload.longPauseEvery) &&
      payload.longPauseEvery > 0
        ? payload.longPauseEvery
        : 0;
    var perDay =
      typeof payload.maxPerDay === "number" &&
      Number.isFinite(payload.maxPerDay) &&
      payload.maxPerDay >= 1
        ? payload.maxPerDay
        : undefined;
    var taskType = resolveTaskType(payload);
    if (taskType === null) taskType = "follow";

    return {
      taskType: taskType,
      maxActions: maxA,
      delayMinMs: payload.delayMinMs,
      delayMaxMs: payload.delayMaxMs,
      maxPerDay: perDay,
      longPauseEvery: every,
      longPauseMinMs:
        typeof payload.longPauseMinMs === "number"
          ? payload.longPauseMinMs
          : Quilt.TASK_DEFAULTS.longPauseMinMs,
      longPauseMaxMs:
        typeof payload.longPauseMaxMs === "number"
          ? payload.longPauseMaxMs
          : Quilt.TASK_DEFAULTS.longPauseMaxMs,
    };
  };

  Quilt.createMessage = function (type, payload) {
    return { type: type, payload: payload || {} };
  };
})(typeof self !== "undefined" ? self : window);
