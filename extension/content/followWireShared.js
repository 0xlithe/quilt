(function (root, factory) {
  var api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    var Quilt = (root.Quilt = root.Quilt || {});
    Quilt.followWireShared = api;
  }
})(
  typeof self !== "undefined"
    ? self
    : typeof window !== "undefined"
      ? window
      : globalThis,
  function () {
    "use strict";

    function absUrl(raw, baseHref) {
      if (raw == null) return "";

      var s = String(raw).trim();
      if (!s) return "";

      try {
        if (s.indexOf("http://") === 0 || s.indexOf("https://") === 0) {
          return s;
        }
        if (baseHref) {
          return new URL(s, baseHref).href;
        }
      } catch (e) {
        /* ignore */
      }

      return s;
    }

    var FOLLOW_BODY_DEFAULTS = [
      ["include_profile_interstitial_type", "1"],
      ["include_blocking", "1"],
      ["include_blocked_by", "1"],
      ["include_followed_by", "1"],
      ["include_want_retweets", "1"],
      ["include_mute_edge", "1"],
      ["include_can_dm", "1"],
      ["include_can_media_tag", "1"],
      ["include_ext_is_blue_verified", "1"],
      ["include_ext_verified_type", "1"],
      ["include_ext_profile_image_shape", "1"],
      ["skip_status", "1"],
    ];

    var BRIDGE_MESSAGES = {
      FOLLOW_WIRE_WAIT: "quiltFollowWireWaitCommand",
      FOLLOW_CLICK: "quiltFollowClickCommand",
      FRIENDSHIP_REQUEST: "quiltFriendshipRequestCommand",
      LIKE_REQUEST: "quiltLikeRequestCommand",
      UNLIKE_REQUEST: "quiltUnlikeRequestCommand",
    };

    var FAVORITE_QUERY_ID = "lI07N6Otwv1PhnEgXILM7A";
    var UNFAVORITE_QUERY_ID = "ZYKSe-w7KEslx3JhSIk5LA";

    var TIMEOUTS = {
      NETWORK_DEFAULT_MS: 12000,
      BRIDGE_REQUEST_MS: 6000,
      LIKE_REQUEST_MS: 8000,
      CONFIRM_SHEET_MS: 2500,
      CONFIRM_SHEET_LONG_MS: 2800,
      ACTIVE_TOKEN_BUFFER_MS: 1500,
      PATCH_RETRY_WINDOW_MS: 6000,
      POLL_INTERVAL_MS: 120,
    };

    function classifyFriendshipRequestKind(rawUrl, baseHref) {
      var u = absUrl(rawUrl, baseHref).toLowerCase();

      if (!u) return null;
      if (u.indexOf("user_flow") !== -1 || u.indexOf("user-flow") !== -1) {
        return null;
      }
      if (
        u.indexOf("x.com") === -1 &&
        u.indexOf("twitter.com") === -1 &&
        u.indexOf("api.twitter.com") === -1 &&
        u.indexOf("/i/api/") === -1
      ) {
        return null;
      }
      if (u.indexOf("/i/api/1.1/friendships/destroy") !== -1) return "unfollow";
      if (u.indexOf("friendships/destroy") !== -1) return "unfollow";
      if (u.indexOf("friendships%2fdestroy") !== -1) return "unfollow";
      if (u.indexOf("/i/api/1.1/friendships/create") !== -1) return "follow";
      if (u.indexOf("friendships/create") !== -1) return "follow";
      if (u.indexOf("friendships%2fcreate") !== -1) return "follow";
      if (u.indexOf("/i/api/") !== -1) {
        if (u.indexOf("createfriendship") !== -1) return "follow";
        if (u.indexOf("friendshipscreate") !== -1) return "follow";
        if (u.indexOf("destroyfriendship") !== -1) return "unfollow";
        if (u.indexOf("friendshipsdestroy") !== -1) return "unfollow";
      }

      return null;
    }

    function classifyFollowRequestUrl(rawUrl, baseHref) {
      return classifyFriendshipRequestKind(rawUrl, baseHref) === "follow";
    }

    function classifyUnfollowRequestUrl(rawUrl, baseHref) {
      return classifyFriendshipRequestKind(rawUrl, baseHref) === "unfollow";
    }

    function friendshipCreateResponseOk(payload) {
      if (!payload || typeof payload.status !== "number") return false;
      if (payload.status < 200 || payload.status >= 300) return false;

      var response = payload.response;
      if (response == null || response === "") return true;
      if (typeof response !== "string") return true;

      try {
        var parsed = JSON.parse(response);
        if (parsed && Array.isArray(parsed.errors) && parsed.errors.length) {
          return false;
        }
      } catch (e) {
        /* ignore */
      }

      return true;
    }

    function createTokenSuffix() {
      var cryptoApi =
        typeof globalThis !== "undefined" && globalThis.crypto
          ? globalThis.crypto
          : null;

      if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
        var bytes = new Uint8Array(8);
        cryptoApi.getRandomValues(bytes);
        return Array.from(bytes)
          .map(function (b) {
            return b.toString(16).padStart(2, "0");
          })
          .join("");
      }

      return Math.random().toString(16).slice(2) + Date.now().toString(16);
    }

    function buildFollowClickMarker(token) {
      return (
        "quilt-follow-click-" +
        String(token || "pending").replace(/[^a-z0-9_-]/gi, "-")
      );
    }

    function buildFriendshipRequestBody(action, target) {
      var mode = String(action || "follow").trim().toLowerCase();
      var payload = new URLSearchParams();
      var t = target || {};
      var userId =
        t.userId != null && String(t.userId).trim() ? String(t.userId).trim() : "";
      var screenName =
        t.screenName != null && String(t.screenName).trim()
          ? String(t.screenName).trim().replace(/^@/, "")
          : "";

      if (mode === "follow") {
        FOLLOW_BODY_DEFAULTS.forEach(function (pair) {
          payload.set(pair[0], pair[1]);
        });
      }

      if (userId) {
        payload.set("user_id", userId);
      } else if (screenName) {
        payload.set("screen_name", screenName);
      }

      return payload.toString();
    }

    function buildFriendshipHeadersFromSnapshot(observedHeaders, fallbackHeaders) {
      var observed = observedHeaders || {};
      var fallback = fallbackHeaders || {};
      var headers = {
        accept: "*/*",
        authorization: observed.authorization || fallback.authorization || "",
        "content-type": "application/x-www-form-urlencoded",
        "x-csrf-token": observed["x-csrf-token"] || fallback["x-csrf-token"] || "",
        "x-twitter-active-user":
          observed["x-twitter-active-user"] ||
          fallback["x-twitter-active-user"] ||
          "yes",
        "x-twitter-auth-type":
          observed["x-twitter-auth-type"] ||
          fallback["x-twitter-auth-type"] ||
          "OAuth2Session",
        "x-twitter-client-language":
          observed["x-twitter-client-language"] ||
          fallback["x-twitter-client-language"] ||
          "en",
      };
      var txnId =
        observed["x-client-transaction-id"] ||
        fallback["x-client-transaction-id"] ||
        "";
      if (txnId) {
        headers["x-client-transaction-id"] = txnId;
      }
      return headers;
    }

    var _bridgeNonce = null;

    function setBridgeNonce(nonce) {
      _bridgeNonce = nonce || null;
    }

    function getBridgeNonce() {
      return _bridgeNonce;
    }

    function makeBridgePayload(kind, detail) {
      var payload = {};
      payload[String(kind)] = 1;
      if (_bridgeNonce) payload._quiltNonce = _bridgeNonce;
      var extra = detail || {};
      var keys = Object.keys(extra);
      for (var i = 0; i < keys.length; i++) {
        payload[keys[i]] = extra[keys[i]];
      }
      return payload;
    }

    function createFollowWireTracker() {
      var seq = 0;
      var waiters = new Map();

      function finish(token, ok) {
        var waiter = waiters.get(token);
        if (!waiter) return false;

        waiters.delete(token);
        clearTimeout(waiter.timer);
        waiter.resolve(!!ok);
        return true;
      }

      return {
        beginWait: function (actionOrTimeoutMs, maybeTimeoutMs) {
          seq += 1;
          var expectedAction =
            typeof actionOrTimeoutMs === "string" && actionOrTimeoutMs
              ? String(actionOrTimeoutMs).trim().toLowerCase()
              : "follow";
          var timeoutMs =
            typeof actionOrTimeoutMs === "number" ? actionOrTimeoutMs : maybeTimeoutMs;
          var token = "follow-wire-" + seq + "-" + createTokenSuffix();
          var waiter = {};
          waiter.promise = new Promise(function (resolve) {
            waiter.resolve = resolve;
          });
          waiter.expectedAction = expectedAction;
          waiter.timer = setTimeout(function () {
            finish(token, false);
          }, typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : 12000);

          waiters.set(token, waiter);
          return { token: token, promise: waiter.promise };
        },

        resolve: function (token, payload) {
          var waiter = waiters.get(token);
          if (!waiter) return false;
          var action = payload && payload.action ? String(payload.action).trim().toLowerCase() : "";
          if (waiter.expectedAction && action && waiter.expectedAction !== action) {
            return finish(token, false);
          }
          return finish(token, friendshipCreateResponseOk(payload));
        },

        cancel: function (token) {
          return finish(token, false);
        },
      };
    }

    var API_ORIGIN = (typeof location !== "undefined" && location.origin) || "https://x.com";

    function buildLikeRequestUrl(queryId) {
      var qid = queryId || FAVORITE_QUERY_ID;
      return API_ORIGIN + "/i/api/graphql/" + qid + "/FavoriteTweet";
    }

    function buildLikeRequestBody(tweetId, queryId) {
      var qid = queryId || FAVORITE_QUERY_ID;
      return JSON.stringify({
        variables: { tweet_id: String(tweetId) },
        queryId: qid,
      });
    }

    function buildLikeHeadersFromSnapshot(observedHeaders, fallbackHeaders) {
      var h = buildFriendshipHeadersFromSnapshot(observedHeaders, fallbackHeaders);
      h["content-type"] = "application/json";
      return h;
    }

    function likeResponseOk(payload) {
      if (!payload || typeof payload.status !== "number") return false;
      if (payload.status < 200 || payload.status >= 300) return false;
      var response = payload.response;
      if (response == null || response === "") return true;
      if (typeof response !== "string") return true;
      try {
        var parsed = JSON.parse(response);
        if (parsed && Array.isArray(parsed.errors) && parsed.errors.length) {
          return false;
        }
      } catch (e) {
        /* ignore */
      }
      return true;
    }

    function extractFavoriteQueryId(rawUrl) {
      var m = String(rawUrl || "").match(/\/graphql\/([A-Za-z0-9_-]+)\/FavoriteTweet/);
      return m ? m[1] : null;
    }

    function buildUnlikeRequestUrl(queryId) {
      var qid = queryId || UNFAVORITE_QUERY_ID;
      return API_ORIGIN + "/i/api/graphql/" + qid + "/UnfavoriteTweet";
    }

    function buildUnlikeRequestBody(tweetId, queryId) {
      var qid = queryId || UNFAVORITE_QUERY_ID;
      return JSON.stringify({
        variables: { tweet_id: String(tweetId) },
        queryId: qid,
      });
    }

    function extractUnfavoriteQueryId(rawUrl) {
      var m = String(rawUrl || "").match(/\/graphql\/([A-Za-z0-9_-]+)\/UnfavoriteTweet/);
      return m ? m[1] : null;
    }

    return {
      absUrl: absUrl,
      BRIDGE_MESSAGES: BRIDGE_MESSAGES,
      FAVORITE_QUERY_ID: FAVORITE_QUERY_ID,
      UNFAVORITE_QUERY_ID: UNFAVORITE_QUERY_ID,
      TIMEOUTS: TIMEOUTS,
      buildFollowClickMarker: buildFollowClickMarker,
      buildFriendshipHeadersFromSnapshot: buildFriendshipHeadersFromSnapshot,
      buildFriendshipRequestBody: buildFriendshipRequestBody,
      buildLikeRequestUrl: buildLikeRequestUrl,
      buildLikeRequestBody: buildLikeRequestBody,
      buildLikeHeadersFromSnapshot: buildLikeHeadersFromSnapshot,
      likeResponseOk: likeResponseOk,
      extractFavoriteQueryId: extractFavoriteQueryId,
      buildUnlikeRequestUrl: buildUnlikeRequestUrl,
      buildUnlikeRequestBody: buildUnlikeRequestBody,
      extractUnfavoriteQueryId: extractUnfavoriteQueryId,
      classifyFriendshipRequestKind: classifyFriendshipRequestKind,
      classifyFollowRequestUrl: classifyFollowRequestUrl,
      classifyUnfollowRequestUrl: classifyUnfollowRequestUrl,
      friendshipCreateResponseOk: friendshipCreateResponseOk,
      makeBridgePayload: makeBridgePayload,
      setBridgeNonce: setBridgeNonce,
      getBridgeNonce: getBridgeNonce,
      createFollowWireTracker: createFollowWireTracker,
    };
  }
);
