(function () {
  "use strict";

  var Quilt = self.Quilt;
  var T = Quilt.MESSAGE_TYPES;
  var SK = Quilt.STORAGE_KEYS;
  var TD = Quilt.TASK_DEFAULTS;

  function $(id) { return document.getElementById(id); }

  /* ═══════════════════════════════════════════
     TAB NAVIGATION
     ═══════════════════════════════════════════ */

  var tabBtns = document.querySelectorAll(".tab-btn");
  var tabContents = { tasks: $("tabTasks"), search: $("tabSearch") };

  function refreshMdComponents(container) {
    if (!container) return;
    requestAnimationFrame(function () {
      container.querySelectorAll("md-outlined-text-field, md-outlined-select").forEach(function (el) {
        void el.offsetHeight;
        if (typeof el.layout === "function") el.layout();
      });
    });
  }

  function switchTab(name) {
    tabBtns.forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-tab") === name); });
    for (var k in tabContents) {
      if (tabContents[k]) tabContents[k].classList.toggle("active", k === name);
    }
    if (name === "search") refreshMdComponents(tabContents.search);
    chrome.storage.local.set({ [SK.SIDEPANEL_TAB]: name });
  }

  tabBtns.forEach(function (b) {
    b.addEventListener("click", function () { switchTab(b.getAttribute("data-tab")); });
  });

  chrome.storage.local.get([SK.SIDEPANEL_TAB], function (r) {
    if (r[SK.SIDEPANEL_TAB] === "search") switchTab("search");
  });

  /* Search sub-tabs */
  var subBtns = document.querySelectorAll(".search-sub-btn");
  var subPanels = { builder: $("subBuilder"), saved: $("subSaved"), categories: $("subCategories") };

  function switchSub(name) {
    subBtns.forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-sub") === name); });
    for (var k in subPanels) {
      if (subPanels[k]) subPanels[k].classList.toggle("active", k === name);
    }
    if (name === "builder") refreshMdComponents(subPanels.builder);
    if (name === "saved") renderSavedSearches();
    if (name === "categories") renderCategories();
  }

  subBtns.forEach(function (b) {
    b.addEventListener("click", function () { switchSub(b.getAttribute("data-sub")); });
  });

  /* ═══════════════════════════════════════════
     TASKS TAB (kept from previous version)
     ═══════════════════════════════════════════ */

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
    timerPanel: $("timerPanel"),
    elapsed: $("elapsed"),
    progressVerb: $("progressVerb"),
    progressCount: $("progressCount"),
    progressFill: $("progressFill"),
    idleState: $("idleState"),
  };

  if (el.maxPostAmount) el.maxPostAmount.value = String(TD.maxPostAmount);
  if (el.delayMin) el.delayMin.value = String(TD.delayMinMs);
  if (el.delayMax) el.delayMax.value = String(TD.delayMaxMs);
  if (el.longPauseMin) el.longPauseMin.value = String(TD.longPauseMinMs);
  if (el.longPauseMax) el.longPauseMax.value = String(TD.longPauseMaxMs);

  /* ── Tier badge + limit hint ── */

  var tierBadge = $("tierBadge");
  var tierLimitHint = $("tierLimitHint");

  function updateTierBadge(tier) {
    if (!tierBadge) return;
    if (tier === "premium") {
      tierBadge.textContent = "PRO";
      tierBadge.className = "tier-badge pro";
    } else {
      tierBadge.textContent = "FREE";
      tierBadge.className = "tier-badge free";
    }
  }

  function updateTierHint() {
    if (!tierLimitHint || !Quilt.licenseApi) return;
    var taskType = getVal(el.taskType) || "follow";
    Quilt.licenseApi.getLimits(taskType).then(function (limits) {
      var cap = limits.maxPerRun;
      var userVal = getInt(el.maxPostAmount);
      if (cap != null && userVal > cap) {
        tierLimitHint.textContent = "";
        var txt = document.createTextNode("Free plan: capped at " + cap + " per run. ");
        var link = document.createElement("a");
        link.id = "tierUpgradeLink";
        link.href = (Quilt.CHECKOUT_URLS && Quilt.CHECKOUT_URLS.monthly) || "#";
        link.target = "_blank";
        link.textContent = "Upgrade";
        tierLimitHint.appendChild(txt);
        tierLimitHint.appendChild(link);
        tierLimitHint.style.display = "block";
      } else if (limits.maxPerDay != null) {
        tierLimitHint.textContent = "Free plan: " + limits.maxPerDay + "/day limit";
        tierLimitHint.style.display = "block";
      } else {
        tierLimitHint.style.display = "none";
      }
    });
  }

  if (Quilt.licenseApi) {
    Quilt.licenseApi.getTier().then(function (tier) {
      updateTierBadge(tier);
      updateTierHint();
    });
  }

  if (el.taskType) el.taskType.addEventListener("change", updateTierHint);
  if (el.maxPostAmount) el.maxPostAmount.addEventListener("input", updateTierHint);

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== "local" || !changes[SK.LICENSE]) return;
    if (Quilt.licenseApi) {
      Quilt.licenseApi.getTier().then(function (tier) {
        updateTierBadge(tier);
        updateTierHint();
      });
    }
  });

  var VERB_MAP = { follow: "Following", unfollow: "Unfollowing", like: "Liking", unlike: "Unliking" };

  var _timerInterval = null;
  var _taskStartedAt = 0;
  var _taskActive = false;

  function getVal(mdEl) { return mdEl && mdEl.value != null ? String(mdEl.value) : ""; }
  function getInt(mdEl) { return parseInt(getVal(mdEl), 10); }

  var SAFE_COLOR_RE = /^#[0-9a-fA-F]{3,8}$|^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$|^hsl\(\s*\d{1,3}\s*,\s*\d{1,3}%?\s*,\s*\d{1,3}%?\s*\)$/;
  function safeColor(c) { return typeof c === "string" && SAFE_COLOR_RE.test(c) ? c : "#6b7280"; }

  function formatElapsed(ms) {
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60);
    s = s % 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }

  function tickTimer() { if (_taskStartedAt) el.elapsed.textContent = formatElapsed(Date.now() - _taskStartedAt); }

  function startTimer(at) {
    _taskStartedAt = at || Date.now();
    _taskActive = true;
    tickTimer();
    if (_timerInterval) clearInterval(_timerInterval);
    _timerInterval = setInterval(tickTimer, 1000);
    el.timerPanel.classList.remove("hidden");
    el.idleState.classList.add("hidden");
  }

  function stopTimer() {
    _taskActive = false;
    if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
  }

  function showIdle() {
    stopTimer();
    el.timerPanel.classList.add("hidden");
    el.idleState.classList.remove("hidden");
    el.elapsed.textContent = "00:00";
    el.progressFill.style.width = "0%";
    el.progressCount.textContent = "0 / 0";
  }

  function updateProgress(completed, maxActions, taskType) {
    var c = typeof completed === "number" ? completed : 0;
    var m = typeof maxActions === "number" && maxActions > 0 ? maxActions : 0;
    el.progressCount.textContent = c + " / " + m;
    el.progressFill.style.width = m > 0 ? Math.min(100, (c / m) * 100) + "%" : "0%";
    if (taskType && VERB_MAP[taskType]) el.progressVerb.textContent = VERB_MAP[taskType];
  }

  function setStatus(text, detail) {
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
      taskType: mode, task: mode,
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
      chrome.runtime.sendMessage(Quilt.createMessage(type, payload), function (res) {
        var err = chrome.runtime.lastError;
        if (err) { resolve({ ok: false, error: err.message }); return; }
        resolve(res || { ok: true });
      });
    });
  }

  el.btnStart.addEventListener("click", function () {
    var p = readPayload();
    if (!Quilt.isTaskStartPayload(p)) { setStatus("Invalid settings", "Check delays and max actions."); return; }
    setStatus("Starting\u2026", "");
    send(T.TASK_START, p).then(function (r) {
      if (!r.ok) { setStatus("Could not start", r.error || ""); return; }
      setStatus("Started", (VERB_MAP[p.taskType] || "Task") + " active on this tab.");
      startTimer(Date.now());
      updateProgress(0, getInt(el.maxPostAmount), p.taskType);
    });
  });

  el.btnStop.addEventListener("click", function () {
    send(T.TASK_STOP, {}).then(function (r) {
      setStatus(r.ok ? "Stopped" : "Stop failed", r.error || "");
      if (r.ok) showIdle();
    });
  });

  function parseProgressFromMessage(msg) {
    if (!msg || typeof msg !== "string") return null;
    var m = msg.match(/(\d+)\s*\/\s*(\d+)/);
    return m ? { completed: parseInt(m[1], 10), total: parseInt(m[2], 10) } : null;
  }

  function applyStatusData(data) {
    if (!data) return;
    var state = data.state || "";
    var msg = data.message || "";
    setStatus(state, msg);
    if (state === "running") {
      if (!_taskActive) startTimer(data.startedAt || Date.now());
      var c = typeof data.completed === "number" ? data.completed : null;
      var mx = typeof data.maxActions === "number" ? data.maxActions : null;
      if (c == null || mx == null) { var p = parseProgressFromMessage(msg); if (p) { if (c == null) c = p.completed; if (mx == null) mx = p.total; } }
      if (c != null && mx != null) updateProgress(c, mx, data.taskType);
    } else if (state === "completed" || state === "cancelled" || state === "stopped" || state === "error") {
      var fc = typeof data.completed === "number" ? data.completed : null;
      var fm = typeof data.maxActions === "number" ? data.maxActions : null;
      if (fc == null || fm == null) { var fp = parseProgressFromMessage(msg); if (fp) { if (fc == null) fc = fp.completed; if (fm == null) fm = fp.total; } }
      if (fc != null && fm != null) updateProgress(fc, fm, data.taskType);
      stopTimer();
    }
  }

  chrome.storage.local.get([SK.LAST_STATUS], function (r) {
    var stored = r[SK.LAST_STATUS];
    if (!stored) { showIdle(); return; }
    if (stored.state === "running" || stored.state === "paused") applyStatusData(stored);
    else { showIdle(); applyStatusData(stored); }
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== "local" || !changes[SK.LAST_STATUS]) return;
    applyStatusData(changes[SK.LAST_STATUS].newValue);
  });

  /* ═══════════════════════════════════════════
     SEARCH TAB — BUILDER
     ═══════════════════════════════════════════ */

  var sq = {
    keywords: $("sqKeywords"),
    minFaves: $("sqMinFaves"),
    maxFaves: $("sqMaxFaves"),
    minRetweets: $("sqMinRetweets"),
    maxRetweets: $("sqMaxRetweets"),
    minReplies: $("sqMinReplies"),
    maxReplies: $("sqMaxReplies"),
    slidingWindow: $("sqSlidingWindow"),
    sinceDate: $("sqSinceDate"),
    untilDate: $("sqUntilDate"),
    fromUser: $("sqFromUser"),
    toUser: $("sqToUser"),
    mentionsUser: $("sqMentionsUser"),
    blueVerified: $("sqBlueVerified"),
    follows: $("sqFollows"),
    hasMedia: $("sqHasMedia"),
    hasImages: $("sqHasImages"),
    hasVideos: $("sqHasVideos"),
    hasLinks: $("sqHasLinks"),
    quoteOnly: $("sqQuoteOnly"),
    replies: $("sqReplies"),
    retweets: $("sqRetweets"),
    lang: $("sqLang"),
    preview: $("queryPreview"),
    btnApply: $("btnApplySearch"),
    btnSave: $("btnSaveSearch"),
    btnReset: $("btnResetSearch"),
    saveDialog: $("saveDialog"),
    saveName: $("sqSaveName"),
    saveCategory: $("sqSaveCategory"),
    btnConfirmSave: $("btnConfirmSave"),
    btnCancelSave: $("btnCancelSave"),
    filterInput: $("sqFilterInput"),
    editBanner: $("editBanner"),
    editBannerName: $("editBannerName"),
    editCancelBtn: $("editCancelBtn"),
  };

  var _editingSearchId = null;

  function readFilters() {
    var repliesVal = getVal(sq.replies);
    var retweetsVal = getVal(sq.retweets);
    return {
      keywords: getVal(sq.keywords),
      minFaves: getVal(sq.minFaves) ? parseInt(getVal(sq.minFaves), 10) : null,
      maxFaves: getVal(sq.maxFaves) ? parseInt(getVal(sq.maxFaves), 10) : null,
      minRetweets: getVal(sq.minRetweets) ? parseInt(getVal(sq.minRetweets), 10) : null,
      maxRetweets: getVal(sq.maxRetweets) ? parseInt(getVal(sq.maxRetweets), 10) : null,
      minReplies: getVal(sq.minReplies) ? parseInt(getVal(sq.minReplies), 10) : null,
      maxReplies: getVal(sq.maxReplies) ? parseInt(getVal(sq.maxReplies), 10) : null,
      slidingWindow: getVal(sq.slidingWindow) || null,
      sinceDate: getVal(sq.sinceDate) || null,
      untilDate: getVal(sq.untilDate) || null,
      fromUser: getVal(sq.fromUser) || null,
      toUser: getVal(sq.toUser) || null,
      mentionsUser: getVal(sq.mentionsUser) || null,
      blueVerified: sq.blueVerified.checked,
      follows: sq.follows.checked,
      hasMedia: sq.hasMedia.checked,
      hasImages: sq.hasImages.checked,
      hasVideos: sq.hasVideos.checked,
      hasLinks: sq.hasLinks.checked,
      quoteOnly: sq.quoteOnly.checked,
      includeReplies: repliesVal === "exclude" ? false : repliesVal === "only" ? true : null,
      includeRetweets: retweetsVal === "exclude" ? false : retweetsVal === "only" ? true : null,
      lang: getVal(sq.lang) || null,
    };
  }

  function loadFiltersIntoBuilder(f) {
    if (!f) return;
    sq.keywords.value = f.keywords || "";
    sq.minFaves.value = f.minFaves != null ? String(f.minFaves) : "";
    sq.maxFaves.value = f.maxFaves != null ? String(f.maxFaves) : "";
    sq.minRetweets.value = f.minRetweets != null ? String(f.minRetweets) : "";
    sq.maxRetweets.value = f.maxRetweets != null ? String(f.maxRetweets) : "";
    sq.minReplies.value = f.minReplies != null ? String(f.minReplies) : "";
    sq.maxReplies.value = f.maxReplies != null ? String(f.maxReplies) : "";
    sq.slidingWindow.value = f.slidingWindow || "";
    updateDateFieldState(f.slidingWindow || "");
    sq.sinceDate.value = f.sinceDate || "";
    sq.untilDate.value = f.untilDate || "";
    sq.fromUser.value = f.fromUser || "";
    sq.toUser.value = f.toUser || "";
    sq.mentionsUser.value = f.mentionsUser || "";
    sq.blueVerified.checked = !!f.blueVerified;
    sq.follows.checked = !!f.follows;
    sq.hasMedia.checked = !!f.hasMedia;
    sq.hasImages.checked = !!f.hasImages;
    sq.hasVideos.checked = !!f.hasVideos;
    sq.hasLinks.checked = !!f.hasLinks;
    sq.quoteOnly.checked = !!f.quoteOnly;
    sq.replies.value = f.includeReplies === false ? "exclude" : f.includeReplies === true ? "only" : "";
    sq.retweets.value = f.includeRetweets === false ? "exclude" : f.includeRetweets === true ? "only" : "";
    sq.lang.value = f.lang || "";
    refreshPreview();
  }

  function buildQuery() {
    var qb = new Quilt.QueryBuilder();
    qb.fromFilters(readFilters());
    return qb.build();
  }

  function refreshPreview() {
    var q = buildQuery();
    sq.preview.textContent = q || "No filters set";
    sq.preview.classList.toggle("has-query", !!q);
  }

  var builderInputs = [
    sq.keywords, sq.minFaves, sq.maxFaves, sq.minRetweets, sq.maxRetweets,
    sq.minReplies, sq.maxReplies,
    sq.slidingWindow, sq.sinceDate, sq.untilDate,
    sq.fromUser, sq.toUser, sq.mentionsUser,
    sq.blueVerified, sq.follows,
    sq.hasMedia, sq.hasImages, sq.hasVideos, sq.hasLinks, sq.quoteOnly,
    sq.replies, sq.retweets, sq.lang,
  ];

  function updateDateFieldState(windowVal) {
    var disabled = !!windowVal;
    sq.sinceDate.disabled = disabled;
    sq.untilDate.disabled = disabled;
    if (disabled) {
      sq.sinceDate.value = "";
      sq.untilDate.value = "";
    }
  }

  function attachBuilderListeners() {
    builderInputs.forEach(function (inp) {
      if (!inp) return;
      var isCb = inp.type === "checkbox";
      inp.addEventListener(isCb ? "change" : "input", refreshPreview);
      if (!isCb) inp.addEventListener("change", refreshPreview);
    });

    sq.slidingWindow.addEventListener("change", function () {
      updateDateFieldState(getVal(sq.slidingWindow));
    });
  }

  if (customElements && customElements.whenDefined) {
    customElements.whenDefined("md-outlined-text-field").then(function () {
      attachBuilderListeners();
      refreshMdComponents(tabContents.search);
    });
  } else {
    attachBuilderListeners();
  }

  function resetBuilder() {
    builderInputs.forEach(function (inp) {
      if (!inp) return;
      if (inp.type === "checkbox") inp.checked = false;
      else inp.value = "";
    });
    _editingSearchId = null;
    sq.editBanner.classList.remove("active");
    sq.saveDialog.classList.remove("active");
    refreshPreview();
  }

  sq.btnReset.addEventListener("click", resetBuilder);

  sq.btnApply.addEventListener("click", function () {
    var q = buildQuery();
    if (!q) return;
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs[0]) return;
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: function (query) {
          window.location.href = (window.location.origin || "https://x.com") + "/search?q=" + encodeURIComponent(query) + "&src=typed_query";
        },
        args: [q],
      });
    });
  });

  /* ── Save flow ── */

  function populateCategoryDropdown() {
    Quilt.searchStorage.getCategories().then(function (cats) {
      sq.saveCategory.innerHTML = "";
      cats.forEach(function (cat) {
        var opt = document.createElement("md-select-option");
        opt.value = cat;
        var div = document.createElement("div");
        div.slot = "headline";
        div.textContent = cat;
        opt.appendChild(div);
        sq.saveCategory.appendChild(opt);
      });
      sq.saveCategory.value = "Uncategorized";
    });
  }

  sq.btnSave.addEventListener("click", function () {
    var q = buildQuery();
    if (!q) return;
    populateCategoryDropdown();
    if (_editingSearchId) {
      sq.saveName.value = sq.editBannerName.textContent || "";
    }
    sq.saveDialog.classList.add("active");
  });

  sq.btnCancelSave.addEventListener("click", function () {
    sq.saveDialog.classList.remove("active");
  });

  sq.btnConfirmSave.addEventListener("click", function () {
    var name = getVal(sq.saveName).trim();
    if (!name) return;
    var filters = readFilters();
    var q = buildQuery();
    var cat = getVal(sq.saveCategory) || "Uncategorized";

    if (_editingSearchId) {
      Quilt.searchStorage.updateSearch(_editingSearchId, {
        name: name,
        query: q,
        filters: filters,
        category: cat,
      }).then(function () {
        sq.saveDialog.classList.remove("active");
        _editingSearchId = null;
        sq.editBanner.classList.remove("active");
        resetBuilder();
      });
    } else {
      Quilt.searchStorage.saveSearch({ name: name, query: q, filters: filters, category: cat }).then(function () {
        sq.saveDialog.classList.remove("active");
        sq.saveName.value = "";
        resetBuilder();
      });
    }
  });

  sq.editCancelBtn.addEventListener("click", function () {
    _editingSearchId = null;
    sq.editBanner.classList.remove("active");
    resetBuilder();
  });

  /* ═══════════════════════════════════════════
     SEARCH TAB — SAVED SEARCHES
     ═══════════════════════════════════════════ */

  var savedListEl = $("savedSearchList");

  var ICON_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
  var ICON_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

  var WINDOW_LABELS = { "1d": "24H", "1w": "1W", "1m": "1M" };

  function renderSavedSearches() {
    Quilt.searchStorage.getSavedSearches().then(function (searches) {
      var filter = getVal(sq.filterInput).toLowerCase();
      if (filter) {
        searches = searches.filter(function (s) {
          return s.name.toLowerCase().indexOf(filter) !== -1 ||
                 (s.query && s.query.toLowerCase().indexOf(filter) !== -1) ||
                 (s.category && s.category.toLowerCase().indexOf(filter) !== -1);
        });
      }
      savedListEl.innerHTML = "";
      if (searches.length === 0) {
        savedListEl.innerHTML = '<div class="empty-state">No saved searches yet</div>';
        return;
      }
      searches.forEach(function (s, idx) {
        var card = document.createElement("div");
        card.className = "search-card";
        card.setAttribute("draggable", "true");
        card.setAttribute("data-id", s.id);
        card.style.borderLeftColor = safeColor(s.color);
        card.style.animation = "stagger 200ms ease-out " + (idx * 30) + "ms both";

        var nameEl = document.createElement("div");
        nameEl.className = "search-card-name";
        nameEl.textContent = s.name;

        var queryEl = document.createElement("div");
        queryEl.className = "search-card-query";
        queryEl.textContent = s.query || "(empty)";

        var metaEl = document.createElement("div");
        metaEl.className = "search-card-meta";

        if (s.filters && s.filters.slidingWindow && WINDOW_LABELS[s.filters.slidingWindow]) {
          var badge = document.createElement("span");
          badge.className = "search-badge";
          badge.style.background = safeColor(s.color);
          badge.textContent = WINDOW_LABELS[s.filters.slidingWindow];
          metaEl.appendChild(badge);
        }

        var chip = document.createElement("span");
        chip.className = "search-cat-chip";
        chip.textContent = s.category || "Uncategorized";
        metaEl.appendChild(chip);

        var actionsEl = document.createElement("div");
        actionsEl.className = "search-card-actions";

        var editBtn = document.createElement("button");
        editBtn.className = "search-icon-btn";
        editBtn.innerHTML = ICON_EDIT;
        editBtn.title = "Edit";
        editBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          _editingSearchId = s.id;
          sq.editBannerName.textContent = s.name;
          sq.editBanner.classList.add("active");
          loadFiltersIntoBuilder(s.filters);
          switchSub("builder");
        });

        var delBtn = document.createElement("button");
        delBtn.className = "search-icon-btn delete";
        delBtn.innerHTML = ICON_TRASH;
        delBtn.title = "Delete";
        delBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          Quilt.searchStorage.deleteSearch(s.id).then(renderSavedSearches);
        });

        actionsEl.appendChild(editBtn);
        actionsEl.appendChild(delBtn);

        card.appendChild(nameEl);
        card.appendChild(queryEl);
        card.appendChild(metaEl);
        card.appendChild(actionsEl);

        card.addEventListener("click", function () {
          Quilt.searchStorage.incrementUseCount(s.id);
          var qb = new Quilt.QueryBuilder();
          qb.fromFilters(s.filters);
          var query = qb.build();
          chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (!tabs[0]) return;
            chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
              func: function (q) {
              window.location.href = (window.location.origin || "https://x.com") + "/search?q=" + encodeURIComponent(q) + "&src=typed_query";
            },
            args: [query],
          });
        });
      });

      /* Drag-and-drop */
        card.addEventListener("dragstart", function (e) {
          card.classList.add("dragging");
          e.dataTransfer.setData("text/plain", s.id);
          e.dataTransfer.effectAllowed = "move";
        });
        card.addEventListener("dragend", function () { card.classList.remove("dragging"); });
        card.addEventListener("dragover", function (e) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; });
        card.addEventListener("drop", function (e) {
          e.preventDefault();
          var draggedId = e.dataTransfer.getData("text/plain");
          if (draggedId === s.id) return;
          var cards = savedListEl.querySelectorAll(".search-card");
          var ids = [];
          cards.forEach(function (c) { ids.push(c.getAttribute("data-id")); });
          var fromIdx = ids.indexOf(draggedId);
          var toIdx = ids.indexOf(s.id);
          if (fromIdx === -1 || toIdx === -1) return;
          ids.splice(fromIdx, 1);
          ids.splice(toIdx, 0, draggedId);
          Quilt.searchStorage.reorderSearches(ids).then(renderSavedSearches);
        });

        savedListEl.appendChild(card);
      });
    });
  }

  var _filterTimer = null;
  sq.filterInput.addEventListener("input", function () {
    if (_filterTimer) clearTimeout(_filterTimer);
    _filterTimer = setTimeout(renderSavedSearches, 200);
  });

  /* ═══════════════════════════════════════════
     SEARCH TAB — CATEGORIES
     ═══════════════════════════════════════════ */

  var catListEl = $("categoryList");
  var catNewName = $("catNewName");
  var catNewColor = $("catNewColor");
  var btnAddCategory = $("btnAddCategory");

  var ICON_CAT_DELETE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  function renderCategories() {
    Promise.all([
      Quilt.searchStorage.getCategories(),
      Quilt.searchStorage.getCategoryColors(),
      Quilt.searchStorage.getSavedSearches(),
    ]).then(function (results) {
      var cats = results[0];
      var colors = results[1];
      var searches = results[2];

      catListEl.innerHTML = "";
      cats.forEach(function (cat, idx) {
        var count = searches.filter(function (s) { return s.category === cat; }).length;
        var color = colors[cat] || "#6b7280";

        var li = document.createElement("li");
        li.className = "cat-item";
        li.style.animation = "stagger 200ms ease-out " + (idx * 30) + "ms both";

        var swatch = document.createElement("input");
        swatch.type = "color";
        swatch.className = "cat-swatch";
        swatch.value = color;
        swatch.style.background = color;
        swatch.addEventListener("change", function () {
          Quilt.searchStorage.setCategoryColor(cat, swatch.value).then(function () {
            return Quilt.searchStorage.updateSearchesInCategory(cat, swatch.value);
          }).then(renderCategories);
        });

        var nameSpan = document.createElement("span");
        nameSpan.className = "cat-name";
        nameSpan.textContent = cat;
        nameSpan.contentEditable = cat !== "Uncategorized";
        nameSpan.spellcheck = false;
        nameSpan.addEventListener("blur", function () {
          var newName = nameSpan.textContent.trim();
          if (newName && newName !== cat) {
            Quilt.searchStorage.renameCategory(cat, newName).then(renderCategories).catch(function () {
              nameSpan.textContent = cat;
            });
          } else {
            nameSpan.textContent = cat;
          }
        });
        nameSpan.addEventListener("keydown", function (e) {
          if (e.key === "Enter") { e.preventDefault(); nameSpan.blur(); }
        });

        var countSpan = document.createElement("span");
        countSpan.className = "cat-count";
        countSpan.textContent = count;

        li.appendChild(swatch);
        li.appendChild(nameSpan);
        li.appendChild(countSpan);

        if (cat !== "Uncategorized") {
          var delBtn = document.createElement("button");
          delBtn.className = "search-icon-btn delete";
          delBtn.innerHTML = ICON_CAT_DELETE;
          delBtn.title = "Delete category";
          delBtn.addEventListener("click", function () {
            Quilt.searchStorage.deleteCategory(cat).then(renderCategories);
          });
          li.appendChild(delBtn);
        }

        catListEl.appendChild(li);
      });
    });
  }

  btnAddCategory.addEventListener("click", function () {
    var name = getVal(catNewName).trim();
    if (!name) return;
    var color = catNewColor.value || "#6b7280";
    Quilt.searchStorage.createCategory(name, color).then(function () {
      catNewName.value = "";
      renderCategories();
    }).catch(function () {});
  });

  /* ═══════════════════════════════════════════
     TEMPLATE SEEDING
     ═══════════════════════════════════════════ */

  if (Quilt.initSearchTemplates) {
    Quilt.initSearchTemplates().catch(function () {});
  }
})();
