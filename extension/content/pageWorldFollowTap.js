/**
 * MAIN world — injected on task start for follow, unfollow, and like.
 * Handles direct API requests (friendships/create, friendships/destroy,
 * graphql/FavoriteTweet) via the page's auth context.
 */
(function () {
  var Quilt = window.Quilt || {};
  var shared = Quilt.followWireShared;
  if (!shared) return;

  var CLICK_ATTR = "data-quilt-follow-click";
  var BRIDGE = shared.BRIDGE_MESSAGES || {};
  var urlByXhr = new WeakMap();
  var tokenByXhr = new WeakMap();
  var headerByXhr = new WeakMap();
  var activeToken = null;
  var activeTokenUntil = 0;
  var WEB_BEARER =
    "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
  var observedApiHeaders = {};
  var capturedFavoriteQueryId = null;
  var capturedUnfavoriteQueryId = null;
  var _nativeFetch =
    window.__quiltNativeFetch ||
    (window.fetch && !window.fetch.__quiltFollowFetchPatched
      ? window.fetch.bind(window)
      : null);
  if (_nativeFetch && !window.__quiltNativeFetch) {
    window.__quiltNativeFetch = _nativeFetch;
  }

  function setActiveToken(token, timeoutMs) {
    if (!token) return;
    activeToken = String(token);
    activeTokenUntil =
      Date.now() +
      (typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : 12000) +
      1500;
  }

  function consumeActiveToken() {
    if (!activeToken || Date.now() > activeTokenUntil) {
      activeToken = null;
      activeTokenUntil = 0;
      return null;
    }
    var token = activeToken;
    activeToken = null;
    activeTokenUntil = 0;
    return token;
  }

  function postFollowWire(payload) {
    try {
      window.postMessage(
        {
          quiltXhr: 1,
          token: payload.token || null,
          response: payload.response,
          status: payload.status,
          transport: payload.transport,
          action: payload.action || null,
          url: payload.url,
        },
        window.location.origin || "*"
      );
    } catch (e) {
      /* ignore */
    }
  }

  function postFollowClickAck(marker, ok) {
    try {
      window.postMessage(
        {
          quiltFollowClick: 1,
          marker: marker,
          ok: !!ok,
        },
        window.location.origin || "*"
      );
    } catch (e) {
      /* ignore */
    }
  }

  function postFriendshipRequestAck(requestId, payload) {
    try {
      window.postMessage(
        {
          quiltFriendshipRequest: 1,
          requestId: requestId,
          ok: !!(payload && payload.ok),
          status: payload && payload.status,
          response: payload && payload.response,
          action: payload && payload.action,
          url: payload && payload.url,
          error: payload && payload.error,
        },
        window.location.origin || "*"
      );
    } catch (e) {
      /* ignore */
    }
  }

  function getCookie(name) {
    var cookies = document.cookie ? document.cookie.split(/;\s*/) : [];
    for (var i = 0; i < cookies.length; i++) {
      var parts = cookies[i].split("=");
      var key = parts.shift();
      if (key === name) return parts.join("=");
    }
    return "";
  }

  function getFriendshipRequestUrl(action) {
    return action === "unfollow"
      ? "https://x.com/i/api/1.1/friendships/destroy.json"
      : "https://x.com/i/api/1.1/friendships/create.json";
  }

  function rememberApiHeaders(headers) {
    if (!headers || typeof headers !== "object") return;
    var keys = Object.keys(headers);
    for (var i = 0; i < keys.length; i++) {
      var key = String(keys[i] || "").toLowerCase();
      if (!key) continue;
      var value = headers[keys[i]];
      if (value == null || value === "") continue;
      observedApiHeaders[key] = String(value);
    }
  }

  function getFetchHeadersSnapshot(input, init) {
    var out = {};

    function append(name, value) {
      if (!name || value == null || value === "") return;
      out[String(name).toLowerCase()] = String(value);
    }

    function readHeaders(headers) {
      if (!headers) return;
      if (typeof headers.forEach === "function") {
        headers.forEach(function (value, key) {
          append(key, value);
        });
        return;
      }
      if (Array.isArray(headers)) {
        for (var i = 0; i < headers.length; i++) {
          var pair = headers[i];
          if (Array.isArray(pair) && pair.length >= 2) append(pair[0], pair[1]);
        }
        return;
      }
      if (typeof headers === "object") {
        var keys = Object.keys(headers);
        for (var j = 0; j < keys.length; j++) append(keys[j], headers[keys[j]]);
      }
    }

    if (input && typeof input === "object" && input.headers) {
      readHeaders(input.headers);
    }
    if (init && typeof init === "object" && init.headers) {
      readHeaders(init.headers);
    }
    return out;
  }

  function buildFriendshipHeaders() {
    var csrf = getCookie("ct0");
    return shared.buildFriendshipHeadersFromSnapshot(observedApiHeaders, {
      authorization: WEB_BEARER,
      "x-csrf-token": csrf,
      "x-twitter-active-user": "yes",
      "x-twitter-auth-type": "OAuth2Session",
      "x-twitter-client-language":
        document.documentElement.lang || navigator.language || "en",
    });
  }

  async function executeFriendshipRequest(action, target) {
    var url = getFriendshipRequestUrl(action);
    var body = shared.buildFriendshipRequestBody(action, target);
    var fetchFn = _nativeFetch || window.fetch;
    var response;
    var text = "";
    try {
      response = await fetchFn(url, {
        headers: buildFriendshipHeaders(),
        referrer: location.href,
        method: "POST",
        mode: "cors",
        credentials: "include",
        body: body,
      });
      try {
        text = await response.text();
      } catch (e) {
        text = "";
      }
      return {
        ok: shared.friendshipCreateResponseOk({
          status: response.status,
          response: text,
        }),
        status: response.status,
        response: text,
        action: action,
        url: url,
      };
    } catch (e2) {
      return {
        ok: false,
        status: 0,
        response: "",
        action: action,
        url: url,
        error: String(e2 && e2.message ? e2.message : e2),
      };
    }
  }

  function postLikeRequestAck(requestId, payload) {
    try {
      window.postMessage(
        {
          quiltLikeRequest: 1,
          requestId: requestId,
          ok: !!(payload && payload.ok),
          status: payload && payload.status,
          response: payload && payload.response,
          action: "like",
          url: payload && payload.url,
          error: payload && payload.error,
        },
        window.location.origin || "*"
      );
    } catch (e) {
      /* ignore */
    }
  }

  function buildLikeHeaders() {
    var csrf = getCookie("ct0");
    return shared.buildLikeHeadersFromSnapshot(observedApiHeaders, {
      authorization: WEB_BEARER,
      "x-csrf-token": csrf,
      "x-twitter-active-user": "yes",
      "x-twitter-auth-type": "OAuth2Session",
      "x-twitter-client-language":
        document.documentElement.lang || navigator.language || "en",
    });
  }

  async function executeLikeRequest(tweetId) {
    var qid = capturedFavoriteQueryId || shared.FAVORITE_QUERY_ID;
    var url = shared.buildLikeRequestUrl(qid);
    var body = shared.buildLikeRequestBody(tweetId, qid);
    var fetchFn = _nativeFetch || window.fetch;
    var response;
    var text = "";
    try {
      response = await fetchFn(url, {
        headers: buildLikeHeaders(),
        referrer: location.href,
        method: "POST",
        mode: "cors",
        credentials: "include",
        body: body,
      });
      try {
        text = await response.text();
      } catch (e) {
        text = "";
      }
      var isOk = response.status >= 200 && response.status < 300;
      if (isOk && text) {
        try {
          var parsed = JSON.parse(text);
          if (parsed && Array.isArray(parsed.errors) && parsed.errors.length) {
            isOk = false;
          }
        } catch (e2) { /* ignore parse failure on 2xx */ }
      }
      return {
        ok: isOk,
        status: response.status,
        response: text,
        action: "like",
        url: url,
      };
    } catch (e3) {
      return {
        ok: false,
        status: 0,
        response: "",
        action: "like",
        url: url,
        error: String(e3 && e3.message ? e3.message : e3),
      };
    }
  }

  function postUnlikeRequestAck(requestId, payload) {
    try {
      window.postMessage(
        {
          quiltUnlikeRequest: 1,
          requestId: requestId,
          ok: !!(payload && payload.ok),
          status: payload && payload.status,
          response: payload && payload.response,
          action: "unlike",
          url: payload && payload.url,
          error: payload && payload.error,
        },
        window.location.origin || "*"
      );
    } catch (e) {
      /* ignore */
    }
  }

  async function executeUnlikeRequest(tweetId) {
    var qid = capturedUnfavoriteQueryId || shared.UNFAVORITE_QUERY_ID;
    var url = shared.buildUnlikeRequestUrl(qid);
    var body = shared.buildUnlikeRequestBody(tweetId, qid);
    var fetchFn = _nativeFetch || window.fetch;
    var response;
    var text = "";
    try {
      response = await fetchFn(url, {
        headers: buildLikeHeaders(),
        referrer: location.href,
        method: "POST",
        mode: "cors",
        credentials: "include",
        body: body,
      });
      try {
        text = await response.text();
      } catch (e) {
        text = "";
      }
      var isOk = response.status >= 200 && response.status < 300;
      if (isOk && text) {
        try {
          var parsed = JSON.parse(text);
          if (parsed && Array.isArray(parsed.errors) && parsed.errors.length) {
            isOk = false;
          }
        } catch (e2) { /* ignore parse failure on 2xx */ }
      }
      return {
        ok: isOk,
        status: response.status,
        response: text,
        action: "unlike",
        url: url,
      };
    } catch (e3) {
      return {
        ok: false,
        status: 0,
        response: "",
        action: "unlike",
        url: url,
        error: String(e3 && e3.message ? e3.message : e3),
      };
    }
  }

  function pointerClickInit(clientX, clientY) {
    var o = {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      buttons: 1,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      pressure: 0.5,
    };
    if (typeof clientX === "number" && typeof clientY === "number") {
      o.clientX = clientX;
      o.clientY = clientY;
    }
    return o;
  }

  function dispatchPointerClickAt(el, clientX, clientY) {
    var o = pointerClickInit(clientX, clientY);
    if (typeof PointerEvent === "function") {
      el.dispatchEvent(new PointerEvent("pointerdown", o));
      el.dispatchEvent(new MouseEvent("mousedown", o));
      el.dispatchEvent(new PointerEvent("pointerup", o));
      el.dispatchEvent(new MouseEvent("mouseup", o));
      el.dispatchEvent(new MouseEvent("click", o));
      return;
    }
    el.dispatchEvent(new MouseEvent("pointerdown", o));
    el.dispatchEvent(new MouseEvent("mousedown", o));
    el.dispatchEvent(new MouseEvent("pointerup", o));
    el.dispatchEvent(new MouseEvent("mouseup", o));
    el.dispatchEvent(new MouseEvent("click", o));
  }

  async function confirmFollowUnfollowSheetIfPresent(timeoutMs) {
    var limit =
      typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : 2500;
    var start = Date.now();
    while (Date.now() - start < limit) {
      var btn = document.querySelector('[data-testid="confirmationSheetConfirm"]');
      if (btn && document.contains(btn)) {
        try {
          btn.scrollIntoView({ behavior: "auto", block: "center" });
        } catch (e) {
          /* ignore */
        }
        await new Promise(function (resolve) {
          setTimeout(resolve, 120);
        });
        if (!document.contains(btn)) return false;
        var r = btn.getBoundingClientRect();
        if (r.width >= 1 && r.height >= 1) {
          try {
            dispatchPointerClickAt(
              btn,
              r.left + r.width * 0.5,
              r.top + r.height * 0.5
            );
          } catch (e2) {
            /* ignore */
          }
        }
        try {
          btn.click();
        } catch (e3) {
          /* ignore */
        }
        return true;
      }
      await new Promise(function (resolve2) {
        setTimeout(resolve2, 120);
      });
    }
    return false;
  }

  async function handleFollowClick(detail) {
    var marker = detail && detail.marker ? String(detail.marker) : "";
    if (!marker) return;
    var target = document.querySelector("[" + CLICK_ATTR + '="' + marker + '"]');
    if (!target || !document.contains(target)) {
      postFollowClickAck(marker, false);
      return;
    }
    try {
      target.scrollIntoView({ behavior: "auto", block: "center" });
    } catch (e) {
      /* ignore */
    }
    await new Promise(function (resolve) {
      setTimeout(resolve, 80);
    });
    if (!document.contains(target)) {
      postFollowClickAck(marker, false);
      return;
    }
    var rect = target.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) {
      postFollowClickAck(marker, false);
      return;
    }
    try {
      dispatchPointerClickAt(
        target,
        rect.left + rect.width * 0.5,
        rect.top + rect.height * 0.5
      );
    } catch (e2) {
      /* ignore */
    }
    try {
      target.click();
    } catch (e3) {
      /* ignore */
    }
    await confirmFollowUnfollowSheetIfPresent(2800);
    postFollowClickAck(marker, true);
  }

  function getFetchUrl(input) {
    if (typeof input === "string") return input;
    if (input && typeof input.url === "string") return input.url;
    return "";
  }

  function patchOpen() {
    if (XMLHttpRequest.prototype.open.__quiltFollowOpenPatched) return;

    var orig = XMLHttpRequest.prototype.open;
    function quiltPatchOpen() {
      urlByXhr.set(this, arguments[1]);
      headerByXhr.set(this, {});
      return orig.apply(this, arguments);
    }
    quiltPatchOpen.__quiltFollowOpenPatched = true;
    XMLHttpRequest.prototype.open = quiltPatchOpen;
  }

  function patchSetRequestHeader() {
    if (XMLHttpRequest.prototype.setRequestHeader.__quiltFollowHeaderPatched) return;

    var orig = XMLHttpRequest.prototype.setRequestHeader;
    function quiltPatchSetRequestHeader(name, value) {
      var headers = headerByXhr.get(this);
      if (!headers) {
        headers = {};
        headerByXhr.set(this, headers);
      }
      if (name) {
        headers[String(name).toLowerCase()] = String(value);
      }
      return orig.apply(this, arguments);
    }
    quiltPatchSetRequestHeader.__quiltFollowHeaderPatched = true;
    XMLHttpRequest.prototype.setRequestHeader = quiltPatchSetRequestHeader;
  }

  function patchSend() {
    if (XMLHttpRequest.prototype.send.__quiltFollowSendPatched) return;

    var orig = XMLHttpRequest.prototype.send;
    function quiltPatchSend(body) {
      var xhr = this;
      var rawUrl = urlByXhr.get(xhr);
      var kind = shared.classifyFriendshipRequestKind(rawUrl, location.href);
      if (/\/i\/api\//i.test(String(rawUrl || ""))) {
        rememberApiHeaders(headerByXhr.get(xhr));
      }
      if (kind) {
        tokenByXhr.set(xhr, consumeActiveToken());
        xhr.addEventListener("load", function onQuiltFollowLoad() {
          if (xhr.responseType === "document") return;
          postFollowWire({
            token: tokenByXhr.get(xhr),
            response: xhr.response,
            status: xhr.status,
            transport: "xhr",
            action: kind,
            url: rawUrl,
          });
        });
      }
      return orig.apply(this, arguments);
    }
    quiltPatchSend.__quiltFollowSendPatched = true;
    XMLHttpRequest.prototype.send = quiltPatchSend;
  }

  function patchFetch() {
    if (typeof window.fetch !== "function") return;
    if (window.fetch.__quiltFollowFetchPatched) return;

    var orig = window.fetch;
    function quiltPatchFetch(input, init) {
      var rawUrl = getFetchUrl(input);
      if (/\/i\/api\//i.test(String(rawUrl || ""))) {
        rememberApiHeaders(getFetchHeadersSnapshot(input, init));
        var fqid = shared.extractFavoriteQueryId(rawUrl);
        if (fqid) capturedFavoriteQueryId = fqid;
        var ufqid = shared.extractUnfavoriteQueryId(rawUrl);
        if (ufqid) capturedUnfavoriteQueryId = ufqid;
      }
      var kind = shared.classifyFriendshipRequestKind(rawUrl, location.href);
      if (!kind) {
        return orig.apply(this, arguments);
      }

      var token = consumeActiveToken();
      return orig.apply(this, arguments).then(function (response) {
        try {
          response
            .clone()
            .text()
            .then(
              function (text) {
                postFollowWire({
                  token: token,
                  response: text,
                  status: response.status,
                  transport: "fetch",
                  action: kind,
                  url: rawUrl,
                });
              },
              function () {
                postFollowWire({
                  token: token,
                  response: "",
                  status: response.status,
                  transport: "fetch",
                  action: kind,
                  url: rawUrl,
                });
              }
            );
        } catch (e) {
          postFollowWire({
            token: token,
            response: "",
            status: response.status,
            transport: "fetch",
            action: kind,
            url: rawUrl,
          });
        }
        return response;
      });
    }
    quiltPatchFetch.__quiltFollowFetchPatched = true;
    window.fetch = quiltPatchFetch;
  }

  function onWindowMessage(ev) {
    if (ev.source !== window) return;
    var d = ev.data;
    if (!d || typeof d !== "object") return;
    if (d[BRIDGE.FOLLOW_WIRE_WAIT] === 1) {
      if (!d.token) return;
      setActiveToken(d.token, d.timeoutMs);
      return;
    }
    if (d[BRIDGE.FOLLOW_CLICK] === 1) {
      if (!d.marker) return;
      handleFollowClick(d);
      return;
    }
    if (d[BRIDGE.FRIENDSHIP_REQUEST] === 1) {
      if (!d.requestId || !d.action || !d.target) return;
      executeFriendshipRequest(d.action, d.target).then(function (result) {
        postFriendshipRequestAck(d.requestId, result);
      });
      return;
    }
    if (d[BRIDGE.LIKE_REQUEST] === 1) {
      if (!d.requestId || !d.tweetId) return;
      executeLikeRequest(d.tweetId).then(function (result) {
        postLikeRequestAck(d.requestId, result);
      });
      return;
    }
    if (d[BRIDGE.UNLIKE_REQUEST] === 1) {
      if (!d.requestId || !d.tweetId) return;
      executeUnlikeRequest(d.tweetId).then(function (result) {
        postUnlikeRequestAck(d.requestId, result);
      });
    }
  }

  if (window.__quiltMessageHandler) {
    window.removeEventListener("message", window.__quiltMessageHandler);
  }
  window.__quiltMessageHandler = onWindowMessage;
  window.addEventListener("message", onWindowMessage);

  patchOpen();
  patchSetRequestHeader();
  patchSend();
  patchFetch();

  if (window.__quiltPatchInterval) {
    clearInterval(window.__quiltPatchInterval);
  }
  var t0 = Date.now();
  window.__quiltPatchInterval = setInterval(function () {
    if (Date.now() - t0 > 6000) {
      clearInterval(window.__quiltPatchInterval);
      window.__quiltPatchInterval = null;
      return;
    }
    patchOpen();
    patchSetRequestHeader();
    patchSend();
    patchFetch();
  }, 200);
})();
