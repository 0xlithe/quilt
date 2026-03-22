const test = require("node:test");
const assert = require("node:assert/strict");

global.window = global;
require("../extension/messaging/messaging.js");

test("task payload validation accepts unfollow mode", () => {
  const payload = {
    taskType: "unfollow",
    task: "unfollow",
    maxPostAmount: 5,
    delayMinMs: 1000,
    delayMaxMs: 2000,
    longPauseEvery: 0,
  };

  assert.equal(global.Quilt.isTaskStartPayload(payload), true);
  assert.equal(global.Quilt.normalizeTaskStartPayload(payload).taskType, "unfollow");
});
