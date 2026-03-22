(function () {
  "use strict";

  var Quilt = (window.Quilt = window.Quilt || {});

  function toArray(nodeList) {
    return Array.prototype.slice.call(nodeList || []);
  }

  var RESERVED_PROFILE_SEGMENTS = {
    home: true,
    explore: true,
    notifications: true,
    messages: true,
    search: true,
    settings: true,
    i: true,
    intent: true,
    intents: true,
    login: true,
    signup: true,
    compose: true,
    jobs: true,
    communities: true,
  };

  function pathnameFirstSegment(href) {
    if (!href || typeof href !== "string") return "";
    var p = href;
    try {
      if (href.indexOf("http://") === 0 || href.indexOf("https://") === 0) {
        p = new URL(href).pathname || "";
      }
    } catch (e) {
      /* keep p */
    }
    var m = (p || "").split("?")[0].match(/^\/([^/?#]+)/);
    return m && m[1] ? m[1].toLowerCase() : "";
  }

  function isProfileFollowersOrFollowingPath() {
    var p = (location.pathname || "").toLowerCase();
    return (
      /\/following(\/|$)/.test(p) ||
      /\/followers(\/|$)/.test(p) ||
      p.indexOf("verified_followers") !== -1
    );
  }

  function getMainContentEl() {
    return (
      document.querySelector('main[role="main"]') ||
      document.querySelector("main")
    );
  }

  function getFollowSearchRoot() {
    if (isProfileFollowersOrFollowingPath()) {
      var main = getMainContentEl();
      if (main) return main;
    }
    /* Home: scan full document so “Who to follow” in the right rail is included
       (it lives outside primaryColumn). isExcludedFollowContext still drops junk. */
    return document.body;
  }

  /** Right-rail recommendations: x.com uses data-testid="wtf" for this module. */
  function isWhoToFollowSidebarModule(el) {
    if (!el || !el.closest) return false;
    if (el.closest('[data-testid="wtf"]')) return true;
    var col = el.closest('[data-testid="sidebarColumn"]');
    if (!col) return false;
    var n = col;
    var depth = 0;
    while (n && depth++ < 14) {
      var al = n.getAttribute && n.getAttribute("aria-label");
      if (al && al.toLowerCase().indexOf("who to follow") !== -1) return true;
      var lid = n.getAttribute && n.getAttribute("aria-labelledby");
      if (lid) {
        var byId = document.getElementById(lid);
        if (
          byId &&
          (byId.textContent || "").toLowerCase().indexOf("who to follow") !== -1
        ) {
          return true;
        }
      }
      n = n.parentElement;
    }
    return false;
  }

  /**
   * Skip sidebar except “Who to follow”; skip flyouts. On profile lists, allow
   * main (sidebar exclusion lifted there).
   */
  function isExcludedFollowContext(el) {
    if (!el || !el.closest) return true;
    if (el.closest('[data-testid="sidebarColumn"]')) {
      if (isWhoToFollowSidebarModule(el)) return false;
      return true;
    }
    if (isProfileFollowersOrFollowingPath()) return false;
    var inMainColumn =
      el.closest('[data-testid="primaryColumn"]') ||
      el.closest('main[role="main"]');
    if (inMainColumn) return false;
    if (el.closest('[data-testid="HoverCard"]')) return true;
    if (el.closest('[data-testid="sheet"]')) return true;
    if (el.closest('[role="dialog"]')) return true;
    if (el.closest('[data-testid="mask"]')) return true;
    return false;
  }

  /**
   * x.com often puts data-testid on an inner node; the React click handler
   * lives on an ancestor [role="button"].
   */
  function resolveClickTarget(el) {
    if (!(el instanceof HTMLElement)) return el;
    if (el.getAttribute("role") === "button") return el;
    var btn = el.closest('[role="button"]');
    return btn || el;
  }

  function isVisible(el) {
    if (!(el instanceof HTMLElement)) return false;
    if (!document.contains(el)) return false;
    var st = window.getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") return false;
    if (parseFloat(st.opacity) === 0) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    if (
      r.bottom < 0 ||
      r.right < 0 ||
      r.top > window.innerHeight ||
      r.left > window.innerWidth
    ) {
      return false;
    }
    if (el.offsetParent !== null) return true;
    var pos = st.position;
    if (pos === "fixed" || pos === "sticky") return true;
    return false;
  }

  function countTimelineArticles() {
    return document.querySelectorAll('article[data-testid="tweet"]').length;
  }

  function countFollowButtonsTotal() {
    return document.querySelectorAll('[data-testid="follow"]').length;
  }

  function countUserCellsTotal() {
    return document.querySelectorAll(
      '[data-testid="UserCell"],[data-testid="cellInnerDiv"]'
    ).length;
  }

  /**
   * Profile lists: follow must be under main inside a row container.
   * Include cellInnerDiv — X often uses it without UserCell / listitem.
   */
  function passesProfileListFollowScope(el) {
    if (!el || !el.closest) return false;
    if (!isProfileFollowersOrFollowingPath()) return true;
    var main = getMainContentEl();
    if (!main || !main.contains(el)) return false;
    return !!(
      el.closest('[data-testid="UserCell"]') ||
      el.closest('[role="listitem"]') ||
      el.closest('[data-testid="cellInnerDiv"]')
    );
  }

  function sortFollowCandidatesByViewport(els) {
    var arr = els.slice();
    arr.sort(function (a, b) {
      var ra = resolveClickTarget(a).getBoundingClientRect();
      var rb = resolveClickTarget(b).getBoundingClientRect();
      if (ra.top !== rb.top) return ra.top - rb.top;
      return ra.left - rb.left;
    });
    return arr;
  }

  /** Prefer targets near the viewport so we don’t “pick” rows far off-screen first. */
  function preferInViewFollowOrder(arr) {
    var inRange = [];
    var rest = [];
    var h = window.innerHeight;
    var i;
    var r;
    for (i = 0; i < arr.length; i++) {
      r = resolveClickTarget(arr[i]).getBoundingClientRect();
      if (r.bottom > -120 && r.top < h + 900) inRange.push(arr[i]);
      else rest.push(arr[i]);
    }
    return inRange.length ? inRange.concat(rest) : arr;
  }

  /**
   * Follow targets: x.com uses transforms; offsetParent is often null while still visible.
   * Use expanded vertical slack on profile lists where the scroll container isn’t the window.
   */
  function isFollowTargetInteractable(el) {
    if (!(el instanceof HTMLElement)) return false;
    if (!document.contains(el)) return false;
    var st = window.getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") return false;
    if (parseFloat(st.opacity) === 0) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    var slackBelow = isProfileFollowersOrFollowingPath() ? 2200 : 400;
    if (r.bottom < -80 || r.right < -80) return false;
    if (r.top > window.innerHeight + slackBelow) return false;
    if (r.left > window.innerWidth + 120) return false;
    return true;
  }

  function getFollowTargetId(button) {
    if (!button || !button.closest) return null;
    var cell = button.closest('[data-testid="UserCell"]');
    if (!cell) {
      cell =
        button.closest('[role="listitem"]') ||
        button.closest("article") ||
        button.closest('[data-testid="cellInnerDiv"]');
    }
    if (!cell) return null;
    var links = toArray(cell.querySelectorAll("a[href]"));
    var best = null;
    var i;
    var href;
    var seg;
    for (i = 0; i < links.length; i++) {
      href = links[i].getAttribute("href") || "";
      if (href.indexOf("/i/") === 0 || href.indexOf("/settings") === 0)
        continue;
      seg = pathnameFirstSegment(href);
      if (!seg || RESERVED_PROFILE_SEGMENTS[seg]) continue;
      var path = href.split("?")[0];
      var pathLower = path.toLowerCase();
      if (/^\/[^/]+\/(?:following|followers|verified_followers|lists)/.test(pathLower))
        continue;
      if (/^\/[^/]+\/status\//.test(pathLower)) continue;
      if (/^\/[A-Za-z0-9_]{1,20}$/.test(path.split("?")[0])) {
        return pathLower;
      }
      if (!best && seg && path.indexOf("/") === 0) best = pathLower;
    }
    return best;
  }

  function getNodeReactValues(node) {
    if (!node || typeof node !== "object") return [];
    var out = [];
    var keys = Object.keys(node);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (
        k.indexOf("__reactProps$") === 0 ||
        k.indexOf("__reactFiber$") === 0 ||
        k.indexOf("__reactContainer$") === 0
      ) {
        out.push(node[k]);
      }
    }
    return out;
  }

  function extractScreenNameFromObject(obj) {
    if (!obj || typeof obj !== "object") return "";
    if (typeof obj.screen_name === "string" && obj.screen_name) return obj.screen_name;
    if (
      obj.legacy &&
      typeof obj.legacy === "object" &&
      typeof obj.legacy.screen_name === "string" &&
      obj.legacy.screen_name
    ) {
      return obj.legacy.screen_name;
    }
    return "";
  }

  function extractUserIdFromObject(obj) {
    if (!obj || typeof obj !== "object") return "";
    if (
      typeof obj.rest_id === "string" &&
      obj.rest_id &&
      /^\d+$/.test(obj.rest_id)
    ) {
      return obj.rest_id;
    }
    if (
      typeof obj.id_str === "string" &&
      obj.id_str &&
      /^\d+$/.test(obj.id_str)
    ) {
      return obj.id_str;
    }
    return "";
  }

  function findUserDescriptor(value, targetScreenName, seen, depth) {
    if (!value || typeof value !== "object") return null;
    if (seen.has(value) || depth > 8) return null;
    seen.add(value);

    var userId = extractUserIdFromObject(value);
    var screenName = extractScreenNameFromObject(value);
    if (
      userId &&
      (!targetScreenName ||
        (screenName && screenName.toLowerCase() === targetScreenName.toLowerCase()))
    ) {
      return {
        userId: userId,
        screenName: screenName || targetScreenName || "",
      };
    }

    var keys = Object.keys(value);
    for (var i = 0; i < keys.length; i++) {
      var nested = value[keys[i]];
      if (!nested || typeof nested !== "object") continue;
      var found = findUserDescriptor(nested, targetScreenName, seen, depth + 1);
      if (found) return found;
    }
    return null;
  }

  function getFollowTargetInfo(button) {
    var path = getFollowTargetId(button);
    var screenName = path ? path.replace(/^\//, "") : "";
    var cell = followContextCell(button);
    var descriptor = null;
    var seen = new Set();

    if (cell && cell.querySelector) {
      var tagged = cell.querySelector("[data-user-id]");
      if (tagged) {
        var taggedUserId = tagged.getAttribute("data-user-id");
        if (taggedUserId && /^\d+$/.test(taggedUserId)) {
          return { path: path, screenName: screenName, userId: taggedUserId };
        }
      }
    }

    var candidates = [];
    if (button) candidates.push(button);
    var clickTarget = button ? resolveClickTarget(button) : null;
    if (clickTarget && clickTarget !== button) candidates.push(clickTarget);
    if (cell && cell !== button && cell !== clickTarget) candidates.push(cell);

    for (var i = 0; i < candidates.length; i++) {
      var reactValues = getNodeReactValues(candidates[i]);
      for (var j = 0; j < reactValues.length; j++) {
        descriptor = findUserDescriptor(reactValues[j], screenName, seen, 0);
        if (descriptor) {
          return {
            path: path,
            screenName: descriptor.screenName || screenName,
            userId: descriptor.userId || "",
          };
        }
      }
    }

    return {
      path: path,
      screenName: screenName,
      userId: "",
    };
  }

  /**
   * Tweet id string from status URL inside the tweet article.
   */
  function getTweetArticle(button) {
    if (!button || !button.closest) return null;
    return (
      button.closest('article[data-testid="tweet"]') || button.closest("article")
    );
  }

  function getTweetIdFromLikeButton(button) {
    var article = getTweetArticle(button);
    if (!article) return null;
    var links = toArray(article.querySelectorAll('a[href*="/status/"]'));
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute("href") || "";
      var m = href.match(/\/status\/(\d+)/);
      if (m && m[1]) return m[1];
    }
    return null;
  }

  function getFollowButtons(processedSet) {
    var set = processedSet instanceof Set ? processedSet : new Set();
    var root = getFollowSearchRoot();
    var nodes = toArray(root.querySelectorAll('[data-testid="follow"]'));
    if (nodes.length === 0 && root !== document.body) {
      nodes = toArray(document.querySelectorAll('[data-testid="follow"]'));
      Quilt.debugApi.log("getFollowButtons: fallback full document");
    }
    var out = [];
    Quilt.debugApi.log("getFollowButtons: raw count", nodes.length);
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (isExcludedFollowContext(el)) continue;
      if (!passesProfileListFollowScope(el)) continue;
      var clickEl = resolveClickTarget(el);
      if (!isFollowTargetInteractable(clickEl)) continue;
      var text = (clickEl.innerText || clickEl.textContent || "").trim().toLowerCase();
      if (text.length <= 48) {
        if (text.indexOf("requested") !== -1) continue;
        if (text.indexOf("following") !== -1) continue;
      }
      var id = getFollowTargetId(el);
      if (id && set.has(id)) continue;
      out.push(el);
    }
    out = sortFollowCandidatesByViewport(out);
    out = preferInViewFollowOrder(out);
    Quilt.debugApi.log("getFollowButtons: candidates", out.length);
    return out;
  }

  function getUnfollowButtons(processedSet) {
    var set = processedSet instanceof Set ? processedSet : new Set();
    if (set.size === 0) {
      Quilt.debugApi.log("getUnfollowButtons: no followed ids saved");
      return [];
    }
    var root = getFollowSearchRoot();
    var nodes = toArray(
      root.querySelectorAll('[data-testid="unfollow"],[data-testid="following"]')
    );
    if (nodes.length === 0 && root !== document.body) {
      nodes = toArray(
        document.querySelectorAll('[data-testid="unfollow"],[data-testid="following"]')
      );
      Quilt.debugApi.log("getUnfollowButtons: fallback full document");
    }
    var seenIds = new Set();
    var out = [];
    Quilt.debugApi.log("getUnfollowButtons: raw count", nodes.length);
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (isExcludedFollowContext(el)) continue;
      if (!passesProfileListFollowScope(el)) continue;
      var clickEl = resolveClickTarget(el);
      if (!isFollowTargetInteractable(clickEl)) continue;
      var id = getFollowTargetId(el);
      if (!id || !set.has(id) || seenIds.has(id)) continue;
      seenIds.add(id);
      out.push(el);
    }
    out = sortFollowCandidatesByViewport(out);
    out = preferInViewFollowOrder(out);
    Quilt.debugApi.log("getUnfollowButtons: candidates", out.length);
    return out;
  }

  function getUserCellTargets(processedSet) {
    var set = processedSet instanceof Set ? processedSet : new Set();
    var root = getFollowSearchRoot();
    var cells = toArray(
      root.querySelectorAll(
        '[data-testid="UserCell"],[data-testid="cellInnerDiv"],[role="listitem"]'
      )
    );
    if (cells.length === 0 && root !== document.body) {
      cells = toArray(
        document.querySelectorAll(
          '[data-testid="UserCell"],[data-testid="cellInnerDiv"],[role="listitem"]'
        )
      );
      Quilt.debugApi.log("getUserCellTargets: fallback full document");
    }
    var seen = new Set();
    var out = [];
    Quilt.debugApi.log("getUserCellTargets: raw cell count", cells.length);
    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i];
      if (isExcludedFollowContext(cell)) continue;
      if (!passesProfileListFollowScope(cell)) continue;
      var path = getFollowTargetId(cell);
      if (!path) continue;
      if (seen.has(path)) continue;
      seen.add(path);
      if (set.has(path)) continue;
      var screenName = path.replace(/^\//, "");
      out.push({ cell: cell, screenName: screenName, path: path });
    }
    out.sort(function (a, b) {
      var ra = a.cell.getBoundingClientRect();
      var rb = b.cell.getBoundingClientRect();
      return ra.top - rb.top || ra.left - rb.left;
    });
    Quilt.debugApi.log("getUserCellTargets: candidates", out.length);
    return out;
  }

  function getUserCellUnfollowTargets(processedSet) {
    var set = processedSet instanceof Set ? processedSet : new Set();
    if (set.size === 0) {
      Quilt.debugApi.log("getUserCellUnfollowTargets: no followed ids");
      return [];
    }
    var root = getFollowSearchRoot();
    var cells = toArray(
      root.querySelectorAll(
        '[data-testid="UserCell"],[data-testid="cellInnerDiv"],[role="listitem"]'
      )
    );
    if (cells.length === 0 && root !== document.body) {
      cells = toArray(
        document.querySelectorAll(
          '[data-testid="UserCell"],[data-testid="cellInnerDiv"],[role="listitem"]'
        )
      );
    }
    var seen = new Set();
    var out = [];
    Quilt.debugApi.log("getUserCellUnfollowTargets: raw cell count", cells.length);
    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i];
      if (isExcludedFollowContext(cell)) continue;
      if (!passesProfileListFollowScope(cell)) continue;
      var path = getFollowTargetId(cell);
      if (!path) continue;
      if (seen.has(path)) continue;
      seen.add(path);
      if (!set.has(path)) continue;
      var screenName = path.replace(/^\//, "");
      out.push({ cell: cell, screenName: screenName, path: path });
    }
    out.sort(function (a, b) {
      var ra = a.cell.getBoundingClientRect();
      var rb = b.cell.getBoundingClientRect();
      return ra.top - rb.top || ra.left - rb.left;
    });
    Quilt.debugApi.log("getUserCellUnfollowTargets: candidates", out.length);
    return out;
  }

  function getLikeButtons(processedSet) {
    var set = processedSet instanceof Set ? processedSet : new Set();
    var nodes = toArray(document.querySelectorAll('[data-testid="like"]'));
    var out = [];
    Quilt.debugApi.log("getLikeButtons: raw count", nodes.length);
    for (var j = 0; j < nodes.length; j++) {
      var el = nodes[j];
      if (!isVisible(el)) continue;
      if (el.getAttribute("aria-pressed") === "true") continue;
      var tid = getTweetIdFromLikeButton(el);
      if (!tid) continue;
      if (set.has(tid)) continue;
      if (!getTweetArticle(el)) continue;
      out.push(el);
    }
    Quilt.debugApi.log("getLikeButtons: candidates", out.length);
    return out;
  }

  function getUnlikeButtons(processedSet) {
    var set = processedSet instanceof Set ? processedSet : new Set();
    var nodes = toArray(document.querySelectorAll('[data-testid="unlike"]'));
    var out = [];
    Quilt.debugApi.log("getUnlikeButtons: raw count", nodes.length);
    for (var j = 0; j < nodes.length; j++) {
      var el = nodes[j];
      if (!isVisible(el)) continue;
      var tid = getTweetIdFromLikeButton(el);
      if (!tid) continue;
      if (set.has(tid)) continue;
      if (!getTweetArticle(el)) continue;
      out.push(el);
    }
    Quilt.debugApi.log("getUnlikeButtons: candidates", out.length);
    return out;
  }

  function detectRateLimitUi() {
    var dialogs = toArray(
      document.querySelectorAll(
        '[role="alertdialog"],[role="dialog"],[data-testid="sheet"]'
      )
    );
    var i;
    var t;
    for (i = 0; i < dialogs.length; i++) {
      t = (dialogs[i].innerText || "").toLowerCase();
      if (
        t.indexOf("rate limit") !== -1 ||
        t.indexOf("try again later") !== -1 ||
        t.indexOf("temporarily restricted") !== -1
      ) {
        return true;
      }
    }
    return false;
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

  function dispatchPointerClick(el) {
    var r = el.getBoundingClientRect();
    dispatchPointerClickAt(el, r.left + r.width * 0.5, r.top + r.height * 0.5);
  }

  function dispatchPointerClickAt(el, clientX, clientY) {
    var o = pointerClickInit(clientX, clientY);
    try {
      if (typeof PointerEvent === "function") {
        el.dispatchEvent(new PointerEvent("pointerdown", o));
        el.dispatchEvent(new MouseEvent("mousedown", o));
        el.dispatchEvent(new PointerEvent("pointerup", o));
        el.dispatchEvent(new MouseEvent("mouseup", o));
        el.dispatchEvent(new MouseEvent("click", o));
      } else {
        el.dispatchEvent(new MouseEvent("pointerdown", o));
        el.dispatchEvent(new MouseEvent("mousedown", o));
        el.dispatchEvent(new MouseEvent("pointerup", o));
        el.dispatchEvent(new MouseEvent("mouseup", o));
        el.dispatchEvent(new MouseEvent("click", o));
      }
    } catch (e) {
      /* ignore */
    }
  }

  function followContextCell(button) {
    if (!button || !button.closest) return null;
    return (
      button.closest('[data-testid="UserCell"]') ||
      button.closest('[role="listitem"]') ||
      button.closest("article") ||
      button.closest('[data-testid="cellInnerDiv"]')
    );
  }

  function followDomLooksFollowed(button) {
    if (!button) return false;
    var cell = followContextCell(button);
    if (cell && document.contains(cell)) {
      if (cell.querySelector('[data-testid="unfollow"]')) return true;
      if (cell.querySelector('[data-testid="following"]')) return true;
    }
    if (button && document.contains(button)) {
      if (button.getAttribute("aria-pressed") === "true") return true;
      var tid = button.getAttribute("data-testid");
      if (tid === "unfollow") return true;
      var tx = (button.innerText || button.textContent || "").trim().toLowerCase();
      if (tx === "following" || tx.indexOf("following\n") === 0) return true;
    }
    return false;
  }

  function followDomLooksUnfollowed(button) {
    if (!button) return false;
    var cell = followContextCell(button);
    if (cell && document.contains(cell)) {
      if (cell.querySelector('[data-testid="follow"]')) return true;
      if (
        cell.querySelector('[data-testid="unfollow"]') ||
        cell.querySelector('[data-testid="following"]')
      ) {
        return false;
      }
    }
    if (button && document.contains(button)) {
      var tid = button.getAttribute("data-testid");
      if (tid === "follow") return true;
      if (tid === "unfollow" || tid === "following") return false;
      var tx = (button.innerText || button.textContent || "").trim().toLowerCase();
      if (tx === "follow" || tx.indexOf("follow\n") === 0) return true;
      if (tx === "following" || tx.indexOf("following\n") === 0) return false;
    }
    return false;
  }

  var FOLLOW_CLICK_ATTR = "data-quilt-follow-click";
  var _pageWorldFollowMsgInstalled = false;
  var _followWireShared = Quilt.followWireShared || null;
  var _bridgeMessages = _followWireShared ? _followWireShared.BRIDGE_MESSAGES || {} : {};
  var _followWireTracker =
    _followWireShared &&
    typeof _followWireShared.createFollowWireTracker === "function"
      ? _followWireShared.createFollowWireTracker()
      : null;

  function dispatchFollowWireWait(token, timeoutMs) {
    if (!token || !_followWireShared || !_followWireShared.makeBridgePayload) return false;
    try {
      window.postMessage(
        _followWireShared.makeBridgePayload(_bridgeMessages.FOLLOW_WIRE_WAIT, {
          token: token,
          timeoutMs: timeoutMs,
        }),
        window.location.origin || "*"
      );
      return true;
    } catch (e) {
      return false;
    }
  }

  function installPageWorldFollowMessageListener() {
    if (_pageWorldFollowMsgInstalled) return;
    _pageWorldFollowMsgInstalled = true;
    window.addEventListener("message", function (ev) {
      if (ev.source !== window) return;
      var d = ev.data;
      if (!d || typeof d !== "object") return;
      if (d.quiltFollowClick === 1) return;
      if (d.quiltFriendshipRequest === 1) return;
      if (d.quiltXhr !== 1) return;
      if (typeof d.url === "undefined") return;
      if (!_followWireShared) return;
      if (!_followWireTracker) return;
      if (!d.token) return;
      _followWireTracker.resolve(d.token, d);
    });
  }

  function requestMainWorldFriendship(action, target, timeoutMs) {
    return new Promise(function (resolve) {
      var requestId =
        "quilt-friendship-" + Date.now() + "-" + Math.random().toString(16).slice(2);
      var settled = false;
      var limit =
        typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : 4500;

      function finish(result) {
        if (settled) return;
        settled = true;
        clearTimeout(tm);
        window.removeEventListener("message", onMessage);
        resolve(
          result || {
            ok: false,
            status: 0,
            action: action,
            error: "request_timeout",
          }
        );
      }

      function onMessage(ev) {
        if (ev.source !== window) return;
        var d = ev.data;
        if (!d || typeof d !== "object") return;
        if (d.quiltFriendshipRequest !== 1) return;
        if (d.requestId !== requestId) return;
        finish(d);
      }

      window.addEventListener("message", onMessage);
      var tm = setTimeout(function () {
        finish(null);
      }, limit);

      try {
        window.postMessage(
          _followWireShared.makeBridgePayload(_bridgeMessages.FRIENDSHIP_REQUEST, {
            requestId: requestId,
            action: action,
            target: target,
          }),
          window.location.origin || "*"
        );
      } catch (e) {
        finish({
          ok: false,
          status: 0,
          action: action,
          error: String(e && e.message ? e.message : e),
        });
      }
    });
  }

  async function performDirectFriendshipRequest(screenName, action) {
    if (!screenName || !_followWireShared) {
      return { ok: false, mode: "request", error: "no_screen_name_or_wire" };
    }
    var result = await requestMainWorldFriendship(
      action,
      { userId: "", screenName: screenName },
      6000
    );
    if (!result) {
      return { ok: false, mode: "request", error: "no_result", status: 0 };
    }
    Quilt.debugApi.log(
      "performDirectFriendshipRequest",
      action,
      screenName,
      "status:",
      result.status
    );
    if (!result.ok) {
      return {
        ok: false,
        mode: "request",
        error:
          result.status === 429
            ? "rate_limited"
            : result.error || "request_failed",
        status: result.status || 0,
      };
    }
    var responseText = result.response || "";
    if (responseText) {
      try {
        var parsed = JSON.parse(responseText);
        if (parsed && Array.isArray(parsed.errors) && parsed.errors.length) {
          return {
            ok: false,
            mode: "request",
            error: "api_errors",
            status: result.status,
          };
        }
        if (parsed && typeof parsed.screen_name === "string") {
          if (parsed.screen_name.toLowerCase() !== screenName.toLowerCase()) {
            Quilt.debugApi.log(
              "performDirectFriendshipRequest: screen_name mismatch",
              parsed.screen_name,
              "vs",
              screenName
            );
            return {
              ok: false,
              mode: "request",
              error: "screen_name_mismatch",
              status: result.status,
            };
          }
        }
      } catch (e) {
        /* JSON parse failure with 2xx status — trust the status */
      }
    }
    return {
      ok: true,
      mode: "request",
      requestOk: true,
      requestStatus: result.status,
    };
  }

  function requestMainWorldLike(tweetId, timeoutMs) {
    return new Promise(function (resolve) {
      var requestId =
        "quilt-like-" + Date.now() + "-" + Math.random().toString(16).slice(2);
      var settled = false;
      var limit =
        typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : 6000;

      function finish(result) {
        if (settled) return;
        settled = true;
        clearTimeout(tm);
        window.removeEventListener("message", onMessage);
        resolve(
          result || {
            ok: false,
            status: 0,
            action: "like",
            error: "request_timeout",
          }
        );
      }

      function onMessage(ev) {
        if (ev.source !== window) return;
        var d = ev.data;
        if (!d || typeof d !== "object") return;
        if (d.quiltLikeRequest !== 1) return;
        if (d.requestId !== requestId) return;
        finish(d);
      }

      window.addEventListener("message", onMessage);
      var tm = setTimeout(function () {
        finish(null);
      }, limit);

      try {
        window.postMessage(
          _followWireShared.makeBridgePayload(_bridgeMessages.LIKE_REQUEST, {
            requestId: requestId,
            tweetId: String(tweetId),
          }),
          window.location.origin || "*"
        );
      } catch (e) {
        finish({
          ok: false,
          status: 0,
          action: "like",
          error: String(e && e.message ? e.message : e),
        });
      }
    });
  }

  async function performDirectLikeRequest(tweetId) {
    if (!tweetId || !_followWireShared) {
      Quilt.debugApi.log("performDirectLikeRequest: missing deps", tweetId, !!_followWireShared);
      return { ok: false, mode: "request", error: "no_tweet_id_or_wire" };
    }
    var result;
    try {
      result = await requestMainWorldLike(tweetId, 8000);
    } catch (e) {
      Quilt.debugApi.log("performDirectLikeRequest: bridge threw", e);
      return { ok: false, mode: "request", error: "bridge_error", status: 0 };
    }
    if (!result) {
      Quilt.debugApi.log("performDirectLikeRequest: bridge timeout for", tweetId);
      return { ok: false, mode: "request", error: "bridge_timeout", status: 0 };
    }
    Quilt.debugApi.log(
      "performDirectLikeRequest", tweetId,
      "ok:", result.ok, "status:", result.status,
      "err:", result.error || "(none)"
    );
    if (result.status === 429) {
      return { ok: false, mode: "request", error: "rate_limited", status: 429 };
    }
    if (result.ok && result.status >= 200 && result.status < 300) {
      return {
        ok: true,
        mode: "request",
        requestOk: true,
        requestStatus: result.status,
      };
    }
    if (result.status >= 200 && result.status < 300) {
      Quilt.debugApi.log("performDirectLikeRequest: 2xx but ok=false, trusting status");
      return {
        ok: true,
        mode: "request",
        requestOk: true,
        requestStatus: result.status,
      };
    }
    return {
      ok: false,
      mode: "request",
      error: result.error || "request_failed",
      status: result.status || 0,
    };
  }

  function requestMainWorldUnlike(tweetId, timeoutMs) {
    return new Promise(function (resolve) {
      var requestId =
        "quilt-unlike-" + Date.now() + "-" + Math.random().toString(16).slice(2);
      var settled = false;
      var limit =
        typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : 6000;

      function finish(result) {
        if (settled) return;
        settled = true;
        clearTimeout(tm);
        window.removeEventListener("message", onMessage);
        resolve(
          result || {
            ok: false,
            status: 0,
            action: "unlike",
            error: "request_timeout",
          }
        );
      }

      function onMessage(ev) {
        if (ev.source !== window) return;
        var d = ev.data;
        if (!d || typeof d !== "object") return;
        if (d.quiltUnlikeRequest !== 1) return;
        if (d.requestId !== requestId) return;
        finish(d);
      }

      window.addEventListener("message", onMessage);
      var tm = setTimeout(function () {
        finish(null);
      }, limit);

      try {
        window.postMessage(
          _followWireShared.makeBridgePayload(_bridgeMessages.UNLIKE_REQUEST, {
            requestId: requestId,
            tweetId: String(tweetId),
          }),
          window.location.origin || "*"
        );
      } catch (e) {
        finish({
          ok: false,
          status: 0,
          action: "unlike",
          error: String(e && e.message ? e.message : e),
        });
      }
    });
  }

  async function performDirectUnlikeRequest(tweetId) {
    if (!tweetId || !_followWireShared) {
      Quilt.debugApi.log("performDirectUnlikeRequest: missing deps", tweetId, !!_followWireShared);
      return { ok: false, mode: "request", error: "no_tweet_id_or_wire" };
    }
    var result;
    try {
      result = await requestMainWorldUnlike(tweetId, 8000);
    } catch (e) {
      Quilt.debugApi.log("performDirectUnlikeRequest: bridge threw", e);
      return { ok: false, mode: "request", error: "bridge_error", status: 0 };
    }
    if (!result) {
      Quilt.debugApi.log("performDirectUnlikeRequest: bridge timeout for", tweetId);
      return { ok: false, mode: "request", error: "bridge_timeout", status: 0 };
    }
    Quilt.debugApi.log(
      "performDirectUnlikeRequest", tweetId,
      "ok:", result.ok, "status:", result.status,
      "err:", result.error || "(none)"
    );
    if (result.status === 429) {
      return { ok: false, mode: "request", error: "rate_limited", status: 429 };
    }
    if (result.ok && result.status >= 200 && result.status < 300) {
      return {
        ok: true,
        mode: "request",
        requestOk: true,
        requestStatus: result.status,
      };
    }
    if (result.status >= 200 && result.status < 300) {
      Quilt.debugApi.log("performDirectUnlikeRequest: 2xx but ok=false, trusting status");
      return {
        ok: true,
        mode: "request",
        requestOk: true,
        requestStatus: result.status,
      };
    }
    return {
      ok: false,
      mode: "request",
      error: result.error || "request_failed",
      status: result.status || 0,
    };
  }

  function whenMainWorldFollowClick(marker, timeoutMs) {
    return new Promise(function (resolve) {
      var settled = false;
      var limit =
        typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : 2200;

      function finish(ok) {
        if (settled) return;
        settled = true;
        clearTimeout(tm);
        window.removeEventListener("message", onMessage);
        resolve(!!ok);
      }

      function onMessage(ev) {
        if (ev.source !== window) return;
        var d = ev.data;
        if (!d || typeof d !== "object") return;
        if (d.quiltFollowClick !== 1) return;
        if (d.marker !== marker) return;
        finish(!!d.ok);
      }

      window.addEventListener("message", onMessage);
      var tm = setTimeout(function () {
        finish(false);
      }, limit);
    });
  }

  function dispatchMainWorldFollowClick(marker) {
    if (!marker || !_followWireShared || !_followWireShared.makeBridgePayload) return false;
    try {
      window.postMessage(
        _followWireShared.makeBridgePayload(_bridgeMessages.FOLLOW_CLICK, {
          marker: marker,
        }),
        window.location.origin || "*"
      );
      return true;
    } catch (e) {
      return false;
    }
  }

  function whenFriendshipNetwork(action, timeoutMs) {
    installPageWorldFollowMessageListener();
    if (!_followWireTracker) return Promise.resolve(false);

    var limit = typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : 12000;
    var wait = _followWireTracker.beginWait(action, limit);
    if (!dispatchFollowWireWait(wait.token, limit)) {
      _followWireTracker.cancel(wait.token);
    }
    return wait.promise;
  }

  function whenFollowCreateNetwork(timeoutMs) {
    return whenFriendshipNetwork("follow", timeoutMs);
  }

  function whenUnfollowDestroyNetwork(timeoutMs) {
    return whenFriendshipNetwork("unfollow", timeoutMs);
  }

  /**
   * Success requires DOM confirmation (Following / unfollow button visible).
   * Network failure (wire says !ok) triggers early abort.
   */
  async function verifyFollowAfterClick(button, networkPromise) {
    var netDone = false;
    var netOk = false;
    if (networkPromise && typeof networkPromise.then === "function") {
      networkPromise.then(
        function (v) {
          netDone = true;
          netOk = !!v;
        },
        function () {
          netDone = true;
          netOk = false;
        }
      );
    }
    var deadline = Date.now() + 12350;
    while (Date.now() < deadline) {
      if (followDomLooksFollowed(button)) return true;
      if (netDone && !netOk) return false;
      await Quilt.delayApi.sleep(380);
    }
    return followDomLooksFollowed(button);
  }

  async function verifyUnfollowAfterClick(button, networkPromise) {
    var netDone = false;
    var netOk = false;
    if (networkPromise && typeof networkPromise.then === "function") {
      networkPromise.then(
        function (v) {
          netDone = true;
          netOk = !!v;
        },
        function () {
          netDone = true;
          netOk = false;
        }
      );
    }
    var deadline = Date.now() + 12350;
    while (Date.now() < deadline) {
      if (followDomLooksUnfollowed(button)) return true;
      if (netDone && !netOk) return false;
      await Quilt.delayApi.sleep(380);
    }
    return followDomLooksUnfollowed(button);
  }

  async function verifyLikeEffect(button) {
    var article = button ? getTweetArticle(button) : null;
    var attempt;
    for (attempt = 0; attempt < 6; attempt++) {
      await Quilt.delayApi.sleep(
        attempt === 0
          ? Quilt.delayApi.randomInt(250, 550)
          : Quilt.delayApi.randomInt(450, 1100)
      );
      if (button && document.contains(button)) {
        if (button.getAttribute("aria-pressed") === "true") return true;
        if (button.getAttribute("data-testid") === "unlike") return true;
      }
      if (article && document.contains(article)) {
        if (article.querySelector('[data-testid="unlike"]')) return true;
      }
    }
    return false;
  }

  async function confirmFollowUnfollowSheetIfPresent(timeoutMs) {
    var limit =
      typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : 2500;
    var t0 = Date.now();
    while (Date.now() - t0 < limit) {
      var raw = document.querySelector(
        '[data-testid="confirmationSheetConfirm"]'
      );
      if (raw && document.contains(raw)) {
        var btn = resolveClickTarget(raw);
        if (isVisible(btn)) {
          try {
            btn.scrollIntoView({ behavior: "auto", block: "center" });
          } catch (e) {
            /* ignore */
          }
          await Quilt.delayApi.sleep(Quilt.delayApi.randomInt(100, 150));
          if (!document.contains(btn)) return false;
          var r = btn.getBoundingClientRect();
          if (r.width >= 1 && r.height >= 1) {
            var xc = r.left + r.width * 0.5;
            var yc = r.top + r.height * 0.5;
            try {
              dispatchPointerClickAt(btn, xc, yc);
            } catch (e2) {
              /* ignore */
            }
          }
          try {
            btn.click();
          } catch (e3) {
            dispatchPointerClick(btn);
          }
          return true;
        }
      }
      await Quilt.delayApi.sleep(120);
    }
    return false;
  }

  async function performIsolatedFriendshipClick(target, actionEl, logLabel) {
    var rect = target.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    var cx = rect.left + rect.width * 0.5;
    var cy = rect.top + rect.height * 0.5;

    var hit = null;
    try {
      hit = document.elementFromPoint(cx, cy);
    } catch (e2) {
      hit = null;
    }

    var hitOutside =
      hit &&
      hit.nodeType === 1 &&
      hit !== target &&
      !target.contains(hit);
    Quilt.debugApi.log((logLabel || "safeClickFriendship") + " hitOutside", !!hitOutside);

    try {
      dispatchPointerClickAt(target, cx, cy);
    } catch (e3) {
      /* ignore */
    }
    try {
      target.click();
    } catch (e4) {
      dispatchPointerClick(target);
    }

    await confirmFollowUnfollowSheetIfPresent(2800);
    return true;
  }

  function resolveFriendshipActionElement(innerOrWrapper, action) {
    if (!innerOrWrapper || !document.contains(innerOrWrapper)) return null;
    var selector =
      action === "unfollow"
        ? '[data-testid="unfollow"],[data-testid="following"]'
        : '[data-testid="follow"]';
    if (
      innerOrWrapper.getAttribute &&
      ((action === "unfollow" &&
        (innerOrWrapper.getAttribute("data-testid") === "unfollow" ||
          innerOrWrapper.getAttribute("data-testid") === "following")) ||
        (action !== "unfollow" && innerOrWrapper.getAttribute("data-testid") === "follow"))
    ) {
      return innerOrWrapper;
    }
    return innerOrWrapper.closest ? innerOrWrapper.closest(selector) : null;
  }

  async function safeClickFriendship(innerOrWrapper, action) {
    if (!innerOrWrapper || !document.contains(innerOrWrapper)) return false;
    var actionEl = resolveFriendshipActionElement(innerOrWrapper, action);
    if (!actionEl || !document.contains(actionEl)) return false;

    var target = actionEl;

    try {
      target.scrollIntoView({ behavior: "auto", block: "center" });
    } catch (e) {
      /* ignore */
    }
    await Quilt.delayApi.sleep(Quilt.delayApi.randomInt(200, 400));
    if (!document.contains(target)) return false;

    var targetInfo = getFollowTargetInfo(target);

    var marker =
      _followWireShared &&
      typeof _followWireShared.buildFollowClickMarker === "function"
        ? _followWireShared.buildFollowClickMarker(Date.now() + "-" + Math.random())
        : "quilt-follow-click-fallback";

    target.setAttribute(FOLLOW_CLICK_ATTR, marker);
    try {
      if (dispatchMainWorldFollowClick(marker)) {
        var mainWorldOk = await whenMainWorldFollowClick(marker, 5000);
        if (mainWorldOk) {
          return {
            ok: true,
            mode: "main-click",
            targetInfo: targetInfo,
          };
        }
      }
    } finally {
      if (document.contains(target)) {
        target.removeAttribute(FOLLOW_CLICK_ATTR);
      }
    }

    var isolatedOk = await performIsolatedFriendshipClick(
      target,
      actionEl,
      action === "unfollow" ? "safeClickUnfollow" : "safeClickFollow"
    );
    if (isolatedOk) {
      return {
        ok: true,
        mode: "isolated-click",
        targetInfo: targetInfo,
      };
    }

    if (targetInfo.screenName && _followWireShared) {
      Quilt.debugApi.log(
        "safeClickFriendship: direct request fallback for",
        targetInfo.screenName
      );
      var requestResult = await requestMainWorldFriendship(
        action,
        { userId: "", screenName: targetInfo.screenName },
        5000
      );
      Quilt.debugApi.log("safeClickFriendship requestResult", action, requestResult);
      if (requestResult && requestResult.ok) {
        return {
          ok: true,
          mode: "request",
          targetInfo: targetInfo,
          requestOk: true,
          requestStatus: requestResult.status,
        };
      }
    }

    return {
      ok: false,
      mode: "all-failed",
      targetInfo: targetInfo,
    };
  }

  async function safeClickFollow(innerOrWrapper) {
    return safeClickFriendship(innerOrWrapper, "follow");
  }

  async function safeClickUnfollow(innerOrWrapper) {
    return safeClickFriendship(innerOrWrapper, "unfollow");
  }

  async function safeClick(el) {
    el = resolveClickTarget(el);
    if (!el || !document.contains(el)) return false;
    try {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (e) {
      /* ignore */
    }
    await Quilt.humanizerApi.sleepPreClick();
    if (!document.contains(el)) return false;
    try {
      el.click();
    } catch (e2) {
      dispatchPointerClick(el);
    }
    return document.contains(el);
  }

  function clickElement(element) {
    return safeClick(element);
  }

  /**
   * x.com usually scrolls the primary column's inner overflow div, not the
   * window — window.scrollBy loads nothing and triggers empty-target loops.
   */
  function getFeedScrollElement() {
    var col = document.querySelector('[data-testid="primaryColumn"]');
    var seed =
      (isProfileFollowersOrFollowingPath()
        ? document.querySelector('main[role="main"]')
        : null) ||
      col ||
      document.querySelector('main[role="main"]');
    if (!(seed instanceof HTMLElement)) return null;

    var best = null;
    var bestExcess = 0;
    function consider(node) {
      if (!(node instanceof HTMLElement)) return;
      var st = window.getComputedStyle(node);
      var oy = st.overflowY;
      if (oy !== "auto" && oy !== "scroll" && oy !== "overlay") return;
      var excess = node.scrollHeight - node.clientHeight;
      if (excess > 80 && excess > bestExcess) {
        bestExcess = excess;
        best = node;
      }
    }

    var el = seed;
    while (el && el !== document.documentElement) {
      consider(el);
      el = el.parentElement;
    }
    if (best) return best;

    if (col) {
      var divs = col.querySelectorAll("div");
      var i;
      for (i = 0; i < divs.length; i++) {
        consider(divs[i]);
      }
    }
    return best;
  }

  function scrollFeed() {
    var dy = Quilt.delayApi.randomInt(280, 1400);
    if (Math.random() < 0.18) {
      dy += Quilt.delayApi.randomInt(200, 700);
    }
    if (isProfileFollowersOrFollowingPath()) {
      dy = Quilt.delayApi.randomInt(600, 1200);
    }
    var scroller = getFeedScrollElement();
    if (scroller) {
      try {
        scroller.scrollTop += dy;
        Quilt.debugApi.log("scrollFeed: column delta", dy);
      } catch (e) {
        try {
          window.scrollBy({ top: dy, left: 0, behavior: "smooth" });
        } catch (e2) {
          window.scrollBy(0, dy);
        }
        Quilt.debugApi.log("scrollFeed: window fallback delta", dy);
      }
    } else {
      try {
        window.scrollBy({ top: dy, left: 0, behavior: "smooth" });
      } catch (e3) {
        window.scrollBy(0, dy);
      }
      Quilt.debugApi.log("scrollFeed: window delta", dy);
    }
  }

  async function scrollFeedHuman() {
    if (Math.random() < 0.12) {
      scrollFeed();
      await Quilt.humanizerApi.afterScrollPause();
    }
    scrollFeed();
    await Quilt.humanizerApi.afterScrollPause();
  }

  /**
   * Wait until timeline or follow-list grows (either metric), or timeout.
   * @param { { articles?: number, followButtons?: number } } [snapshot]
   * @param {number} [timeoutMs]
   */
  function waitForNewContent(snapshot, timeoutMs) {
    var snap = snapshot && typeof snapshot === "object" ? snapshot : {};
    var prevA =
      typeof snap.articles === "number"
        ? snap.articles
        : countTimelineArticles();
    var prevF =
      typeof snap.followButtons === "number"
        ? snap.followButtons
        : countFollowButtonsTotal();
    var prevC =
      typeof snap.userCells === "number"
        ? snap.userCells
        : countUserCellsTotal();
    var limit =
      typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : 12000;

    return new Promise(function (resolve) {
      var done = false;
      function finish(result) {
        if (done) return;
        done = true;
        try {
          observer.disconnect();
        } catch (e) {
          /* ignore */
        }
        clearTimeout(timer);
        resolve(result);
      }

      var observer = new MutationObserver(function () {
        var a = countTimelineArticles();
        var f = countFollowButtonsTotal();
        var c = countUserCellsTotal();
        if (a > prevA || f > prevF || c > prevC) {
          Quilt.debugApi.log(
            "waitForNewContent: growth articles",
            a,
            "/ follow",
            f
          );
          finish({
            ok: true,
            articles: a,
            followButtons: f,
          });
        }
      });

      var root =
        document.querySelector('main[role="main"]') || document.body;
      try {
        observer.observe(root, { childList: true, subtree: true });
      } catch (e2) {
        finish({ ok: false, reason: "observe_failed" });
        return;
      }

      var timer = setTimeout(function () {
        var a = countTimelineArticles();
        var f = countFollowButtonsTotal();
        Quilt.debugApi.log("waitForNewContent: timeout", a, f);
        finish({
          ok: false,
          reason: "timeout",
          articles: a,
          followButtons: f,
        });
      }, limit);
    });
  }

  var _feedObserver = null;
  var _feedListeners = [];

  function notifyDomListeners() {
    for (var i = 0; i < _feedListeners.length; i++) {
      try {
        _feedListeners[i]();
      } catch (e) {
        /* ignore */
      }
    }
  }

  function installFeedObserver(listener) {
    if (typeof listener === "function") _feedListeners.push(listener);

    if (_feedObserver) return;
    if (_feedListeners.length === 0) return;

    var scheduled = false;
    _feedObserver = new MutationObserver(function () {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(function () {
        scheduled = false;
        notifyDomListeners();
      });
    });

    var root = document.querySelector('main[role="main"]') || document.body;
    try {
      _feedObserver.observe(root, { childList: true, subtree: true });
    } catch (e) {
      _feedObserver = null;
    }
    Quilt.debugApi.log("installFeedObserver: attached");
  }

  function uninstallFeedObserver(listener) {
    if (typeof listener === "function") {
      _feedListeners = _feedListeners.filter(function (fn) {
        return fn !== listener;
      });
    }
    if (_feedListeners.length > 0 || !_feedObserver) return;
    try {
      _feedObserver.disconnect();
    } catch (e) {
      /* ignore */
    }
    _feedObserver = null;
    Quilt.debugApi.log("uninstallFeedObserver: disconnected");
  }

  Quilt.domActionsApi = {
    getFollowButtons: getFollowButtons,
    getUnfollowButtons: getUnfollowButtons,
    getUserCellTargets: getUserCellTargets,
    getUserCellUnfollowTargets: getUserCellUnfollowTargets,
    getLikeButtons: getLikeButtons,
    getUnlikeButtons: getUnlikeButtons,
    getFollowTargetId: getFollowTargetId,
    getTweetArticle: getTweetArticle,
    getTweetIdFromLikeButton: getTweetIdFromLikeButton,
    safeClick: safeClick,
    safeClickFollow: safeClickFollow,
    safeClickUnfollow: safeClickUnfollow,
    clickElement: clickElement,
    detectRateLimitUi: detectRateLimitUi,
    verifyLikeEffect: verifyLikeEffect,
    whenFollowCreateNetwork: whenFollowCreateNetwork,
    whenUnfollowDestroyNetwork: whenUnfollowDestroyNetwork,
    verifyFollowAfterClick: verifyFollowAfterClick,
    verifyUnfollowAfterClick: verifyUnfollowAfterClick,
    performDirectFriendshipRequest: performDirectFriendshipRequest,
    requestMainWorldLike: requestMainWorldLike,
    performDirectLikeRequest: performDirectLikeRequest,
    requestMainWorldUnlike: requestMainWorldUnlike,
    performDirectUnlikeRequest: performDirectUnlikeRequest,
    getFeedScrollElement: getFeedScrollElement,
    scrollFeed: scrollFeed,
    scrollFeedHuman: scrollFeedHuman,
    waitForNewContent: waitForNewContent,
    countTimelineArticles: countTimelineArticles,
    countFollowButtonsTotal: countFollowButtonsTotal,
    countUserCellsTotal: countUserCellsTotal,
    installFeedObserver: installFeedObserver,
    uninstallFeedObserver: uninstallFeedObserver,
  };
})();
