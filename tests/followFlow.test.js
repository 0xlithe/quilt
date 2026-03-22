const test = require("node:test");
const assert = require("node:assert/strict");

const {
  BRIDGE_MESSAGES,
  buildFollowClickMarker,
  buildFriendshipHeadersFromSnapshot,
  buildFriendshipRequestBody,
  classifyFriendshipRequestKind,
  classifyUnfollowRequestUrl,
  classifyFollowRequestUrl,
  createFollowWireTracker,
  makeBridgePayload,
  friendshipCreateResponseOk,
} = require("../extension/content/followWireShared.js");
const taskStatusShared = require("../extension/core/taskStatusShared.js");

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

test("follow wire tracker ignores mismatched friendship action", async () => {
  const tracker = createFollowWireTracker();
  const wait = tracker.beginWait("unfollow", 50);

  tracker.resolve(wait.token, {
    status: 200,
    response: "{}",
    action: "follow",
  });

  assert.equal(await wait.promise, false);
});

test("friendshipCreateResponseOk rejects error payloads", () => {
  assert.equal(
    friendshipCreateResponseOk({
      status: 200,
      response: JSON.stringify({ errors: [{ message: "blocked" }] }),
    }),
    false
  );
});

test("task status helper describes follow attempt phases", () => {
  assert.equal(
    taskStatusShared.formatAttemptingMessage("Follow", "/example"),
    "Attempting follow: /example"
  );
  assert.equal(
    taskStatusShared.formatWaitingMessage("Follow", "/example"),
    "Waiting for follow confirmation: /example"
  );
  assert.equal(
    taskStatusShared.formatClickFailedMessage("Follow", "/example", 2),
    "Follow click failed for /example (attempt 2)"
  );
  assert.equal(
    taskStatusShared.formatNotVerifiedMessage("Follow", "/example", 3),
    "Follow not yet confirmed for /example (attempt 3)"
  );
});

test("buildFollowClickMarker returns a stable DOM-safe marker", () => {
  assert.equal(
    buildFollowClickMarker("follow-wire-1-abc123"),
    "quilt-follow-click-follow-wire-1-abc123"
  );
});

test("classify friendship request kind handles create and destroy", () => {
  assert.equal(
    classifyFriendshipRequestKind("https://x.com/i/api/1.1/friendships/create.json"),
    "follow"
  );
  assert.equal(
    classifyFriendshipRequestKind("https://x.com/i/api/1.1/friendships/destroy.json"),
    "unfollow"
  );
  assert.equal(
    classifyUnfollowRequestUrl("https://x.com/i/api/1.1/friendships/destroy.json"),
    true
  );
});

test("build friendship request body mirrors superpowers create shape", () => {
  assert.equal(
    buildFriendshipRequestBody("follow", { userId: "1951266347641430018" }),
    "include_profile_interstitial_type=1&include_blocking=1&include_blocked_by=1&include_followed_by=1&include_want_retweets=1&include_mute_edge=1&include_can_dm=1&include_can_media_tag=1&include_ext_is_blue_verified=1&include_ext_verified_type=1&include_ext_profile_image_shape=1&skip_status=1&user_id=1951266347641430018"
  );
  assert.equal(
    buildFriendshipRequestBody("unfollow", { userId: "1951266347641430018" }),
    "user_id=1951266347641430018"
  );
});

test("makeBridgePayload creates command messages for main-world bridge", () => {
  assert.deepEqual(
    makeBridgePayload(BRIDGE_MESSAGES.FOLLOW_WIRE_WAIT, {
      token: "follow-wire-1",
      timeoutMs: 12000,
    }),
    {
      quiltFollowWireWaitCommand: 1,
      token: "follow-wire-1",
      timeoutMs: 12000,
    }
  );
  assert.deepEqual(
    makeBridgePayload(BRIDGE_MESSAGES.FRIENDSHIP_REQUEST, {
      requestId: "req-1",
      action: "follow",
    }),
    {
      quiltFriendshipRequestCommand: 1,
      requestId: "req-1",
      action: "follow",
    }
  );
});

test("buildFriendshipHeadersFromSnapshot prefers live observed auth headers", () => {
  assert.deepEqual(
    buildFriendshipHeadersFromSnapshot(
      {
        authorization: "Bearer live-token",
        "x-csrf-token": "live-ct0",
        "x-client-transaction-id": "txn-123",
        "x-twitter-client-language": "en",
      },
      {
        authorization: "Bearer fallback-token",
        "x-csrf-token": "fallback-ct0",
        "x-twitter-client-language": "en-US",
      }
    ),
    {
      accept: "*/*",
      authorization: "Bearer live-token",
      "content-type": "application/x-www-form-urlencoded",
      "x-csrf-token": "live-ct0",
      "x-twitter-active-user": "yes",
      "x-twitter-auth-type": "OAuth2Session",
      "x-twitter-client-language": "en",
      "x-client-transaction-id": "txn-123",
    }
  );
});
