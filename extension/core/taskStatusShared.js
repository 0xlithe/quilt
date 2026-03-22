(function (root, factory) {
  var api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    var Quilt = (root.Quilt = root.Quilt || {});
    Quilt.taskStatusShared = api;
  }
})(
  typeof self !== "undefined"
    ? self
    : typeof window !== "undefined"
      ? window
      : globalThis,
  function () {
    "use strict";

    function normalizeActionLabel(actionLabel) {
      return String(actionLabel || "task").trim().toLowerCase();
    }

    function normalizeTargetLabel(targetLabel) {
      var text = String(targetLabel || "").trim();
      return text || "(unknown)";
    }

    function formatAttemptingMessage(actionLabel, targetLabel) {
      return (
        "Attempting " +
        normalizeActionLabel(actionLabel) +
        ": " +
        normalizeTargetLabel(targetLabel)
      );
    }

    function formatWaitingMessage(actionLabel, targetLabel) {
      return (
        "Waiting for " +
        normalizeActionLabel(actionLabel) +
        " confirmation: " +
        normalizeTargetLabel(targetLabel)
      );
    }

    function formatClickFailedMessage(actionLabel, targetLabel, attemptNumber) {
      return (
        String(actionLabel || "Task").trim() +
        " click failed for " +
        normalizeTargetLabel(targetLabel) +
        " (attempt " +
        String(attemptNumber || 1) +
        ")"
      );
    }

    function formatNotVerifiedMessage(actionLabel, targetLabel, attemptNumber) {
      return (
        String(actionLabel || "Task").trim() +
        " not yet confirmed for " +
        normalizeTargetLabel(targetLabel) +
        " (attempt " +
        String(attemptNumber || 1) +
        ")"
      );
    }

    return {
      formatAttemptingMessage: formatAttemptingMessage,
      formatWaitingMessage: formatWaitingMessage,
      formatClickFailedMessage: formatClickFailedMessage,
      formatNotVerifiedMessage: formatNotVerifiedMessage,
    };
  }
);
