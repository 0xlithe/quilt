# Follow Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Quilt's follow task reliably trigger and verify the same follow behavior class as manual x.com usage by fixing the click path, adding fetch-aware wire detection, and removing stale network races.

**Architecture:** Keep Quilt's existing narrow follow-only MAIN-world instrumentation, but refactor it into a shared request-matching model that can observe both `XMLHttpRequest` and `fetch`. Replace the single global follow waiter with click-scoped tokens so each attempted follow only resolves from its own post-click wire event or matching DOM state. Tighten background injection error handling and the row-level follow click sequence so Quilt drives the same interaction path as a real user more consistently.

**Tech Stack:** Manifest V3 Chrome extension, vanilla JavaScript, content scripts, MAIN-world injected page script, `chrome.scripting`, `chrome.storage.local`, minimal Node-based regression tests.

---

### Task 1: Add a Tiny Follow Regression Test Harness

**Files:**
- Create: `package.json`
- Create: `tests/followFlow.test.js`
- Test: `tests/followFlow.test.js`

**Step 1: Write the failing test**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  classifyFollowRequestUrl,
  createFollowWireTracker,
} = require("../extension/content/followWireShared.js");

test("classifyFollowRequestUrl accepts friendships/create and rejects user_flow", () => {
  assert.equal(
    classifyFollowRequestUrl("https://x.com/i/api/1.1/friendships/create.json"),
    true
  );
  assert.equal(
    classifyFollowRequestUrl("https://x.com/i/api/graphql/abc/user_flow.json"),
    false
  );
});

test("follow wire tracker only resolves the token that was awaited", async () => {
  const tracker = createFollowWireTracker();
  const first = tracker.beginWait(50);
  const second = tracker.beginWait(50);

  tracker.resolve(second.token, { status: 200, response: "{}" });

  assert.equal(await second.promise, true);
  assert.equal(await first.promise, false);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/followFlow.test.js`
Expected: FAIL with module-not-found because `extension/content/followWireShared.js` does not exist yet.

**Step 3: Write minimal implementation**

```js
function classifyFollowRequestUrl(rawUrl) {
  // shared follow-request matcher used by both tests and runtime code
}

function createFollowWireTracker() {
  // create click-scoped waiters keyed by token
}

module.exports = {
  classifyFollowRequestUrl,
  createFollowWireTracker,
};
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/followFlow.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add package.json tests/followFlow.test.js extension/content/followWireShared.js
git commit -m "test: add follow wire regression harness"
```

### Task 2: Refactor MAIN-World Follow Wire Capture

**Files:**
- Create: `extension/content/followWireShared.js`
- Modify: `extension/content/pageWorldFollowTap.js`
- Test: `tests/followFlow.test.js`

**Step 1: Write the failing test**

```js
test("classifyFollowRequestUrl accepts relative and encoded create URLs", () => {
  assert.equal(
    classifyFollowRequestUrl("/i/api/1.1/friendships/create.json?user_id=1"),
    true
  );
  assert.equal(
    classifyFollowRequestUrl("https://x.com/i/api/1.1/friendships%2Fcreate.json"),
    true
  );
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/followFlow.test.js`
Expected: FAIL because URL matching is not comprehensive enough yet.

**Step 3: Write minimal implementation**

```js
// in followWireShared.js
function classifyFollowRequestUrl(rawUrl) {
  // normalize absolute/relative URLs
  // reject user_flow and destroy URLs
  // accept friendships/create in plain and encoded forms
}

// in pageWorldFollowTap.js
// patch both XMLHttpRequest and fetch
// emit a postMessage payload with a click token and response metadata
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/followFlow.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add extension/content/followWireShared.js extension/content/pageWorldFollowTap.js tests/followFlow.test.js
git commit -m "fix: capture follow wire events across xhr and fetch"
```

### Task 3: Replace the Global Waiter in Content-Script Follow Verification

**Files:**
- Modify: `extension/content/domActions.js`
- Test: `tests/followFlow.test.js`

**Step 1: Write the failing test**

```js
test("follow wire tracker ignores stale events for other tokens", async () => {
  const tracker = createFollowWireTracker();
  const first = tracker.beginWait(30);
  const second = tracker.beginWait(30);

  tracker.resolve(first.token, { status: 200, response: "{}" });

  assert.equal(await first.promise, true);
  assert.equal(await second.promise, false);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/followFlow.test.js`
Expected: FAIL because the tracker still behaves like a shared global waiter or lacks token-specific cleanup.

**Step 3: Write minimal implementation**

```js
// in domActions.js
// install one message listener
// keep a token-keyed follow wire tracker
// beginFollowNetworkWait returns { token, promise }
// verifyFollowAfterClick awaits token-specific promise or DOM success
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/followFlow.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add extension/content/domActions.js tests/followFlow.test.js extension/content/followWireShared.js
git commit -m "fix: scope follow verification to each click"
```

### Task 4: Harden Follow Click Delivery and Injection Errors

**Files:**
- Modify: `extension/content/domActions.js`
- Modify: `extension/background/background.js`
- Modify: `extension/core/taskRunner.js`
- Test: `tests/followFlow.test.js`

**Step 1: Write the failing test**

```js
test("follow response payloads with errors do not resolve success", async () => {
  const tracker = createFollowWireTracker();
  const wait = tracker.beginWait(30);

  tracker.resolve(wait.token, {
    status: 200,
    response: JSON.stringify({ errors: [{ message: "blocked" }] }),
  });

  assert.equal(await wait.promise, false);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/followFlow.test.js`
Expected: FAIL because response validation and tracker resolution do not reject error payloads yet.

**Step 3: Write minimal implementation**

```js
// in domActions.js
// always drive the centered pointer sequence before fallback click paths
// only accept token-matched successful follow payloads

// in background.js
// return an explicit error when MAIN-world follow tap injection fails

// in taskRunner.js
// stop follow start cleanly if network tap setup was required and unavailable
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/followFlow.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add extension/content/domActions.js extension/background/background.js extension/core/taskRunner.js tests/followFlow.test.js
git commit -m "fix: harden follow click delivery and injection handling"
```

### Task 5: Verify the Full Follow Flow

**Files:**
- Modify: `extension/content/pageWorldFollowTap.js`
- Modify: `extension/content/domActions.js`
- Modify: `extension/background/background.js`
- Modify: `extension/core/taskRunner.js`
- Test: `tests/followFlow.test.js`

**Step 1: Run targeted tests**

Run: `npm test -- tests/followFlow.test.js`
Expected: PASS

**Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS

**Step 3: Check edited files for diagnostics**

Run: Cursor lints for:
- `extension/content/followWireShared.js`
- `extension/content/pageWorldFollowTap.js`
- `extension/content/domActions.js`
- `extension/background/background.js`
- `extension/core/taskRunner.js`

Expected: no new errors introduced by the fix.

**Step 4: Manual verification**

Run Quilt on x.com with Follow mode and confirm:
- a real Follow click still changes the row to Following when successful
- Quilt sees a token-matched follow wire event when x.com emits `friendships/create`
- unrelated `user_flow` traffic does not satisfy the follow verification path

**Step 5: Commit**

```bash
git add package.json tests/followFlow.test.js extension/content/followWireShared.js extension/content/pageWorldFollowTap.js extension/content/domActions.js extension/background/background.js extension/core/taskRunner.js
git commit -m "fix: make follow flow reliable and token-scoped"
```
