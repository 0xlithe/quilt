(function () {
  "use strict";

  var Quilt = (window.Quilt = window.Quilt || {});

  var T = Quilt.MESSAGE_TYPES;

  var FADE_OPACITY_DURATION = "0.35s";
  var FADE_COLLAPSE_TRANSITION = "max-height 0.4s ease-in-out, margin 0.3s ease-in-out, padding 0.3s ease-in-out";
  var FADE_COLLAPSE_START_DELAY_MS = 380;
  var FADE_REMOVE_DELAY_MS = 450;

  var _taskMeta = { taskType: null, startedAt: 0, maxActions: 0 };

  function emitStatus(state, message, extra) {
    var payload = { state: state, message: message || "" };
    if (_taskMeta.taskType) payload.taskType = _taskMeta.taskType;
    if (_taskMeta.startedAt) payload.startedAt = _taskMeta.startedAt;
    if (_taskMeta.maxActions) payload.maxActions = _taskMeta.maxActions;
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) {
          payload[k] = extra[k];
        }
      }
    }
    try {
      chrome.runtime.sendMessage(
        Quilt.createMessage(T.TASK_STATUS, payload),
        function () {
          void chrome.runtime.lastError;
        }
      );
    } catch (e) {
      /* ignore */
    }
  }

  function statusMessageBuilder() {
    return Quilt.taskStatusShared || {};
  }

  function TaskRunner() {
    this._running = false;
    this._cancelled = false;
    this._paused = false;
    this._pauseResolvers = [];
    this._limiter = null;
    this._epoch = 0;
  }

  TaskRunner.prototype._waitIfPaused = async function () {
    while (this._paused && !this._cancelled) {
      await new Promise(
        function (resolve) {
          this._pauseResolvers.push(resolve);
        }.bind(this)
      );
    }
  };

  TaskRunner.prototype._resolvePauseWaiters = function () {
    var rs = this._pauseResolvers;
    this._pauseResolvers = [];
    rs.forEach(function (r) {
      r();
    });
  };

  TaskRunner.prototype.isRunning = function () {
    return this._running;
  };

  TaskRunner.prototype.cancel = function () {
    this._cancelled = true;
    this._paused = false;
    this._running = false;
    this._limiter = null;
    this._resolvePauseWaiters();
    emitStatus("cancelled", "Task cancelled");
  };

  TaskRunner.prototype.pause = function () {
    if (!this._running || this._cancelled) return;
    this._paused = true;
    emitStatus("paused", "Task paused");
  };

  TaskRunner.prototype.resume = function () {
    if (!this._running || this._cancelled) return;
    this._paused = false;
    this._resolvePauseWaiters();
    emitStatus("running", "Task resumed");
  };

  TaskRunner.prototype._isCancelled = function () {
    return this._cancelled;
  };

  /**
   * @param {object} norm
   * @param {object} spec
   * @param {function(Set): Element[]} spec.getButtons
   * @param {function(Element): string|null} spec.getTargetId
   * @param {function(): Promise<Set>} spec.loadProcessed
   * @param {function(Set): Promise<void>} spec.saveProcessed
   * @param {function(Element, Promise<boolean>|undefined): Promise<boolean>} spec.verifyAfterClick
   * @param {function(): Promise<boolean>} [spec.beginFollowNetworkWait] — MAIN inject + friendships/create
   * @param {string} spec.actionLabel
   * @param {number} [spec.maxEmptyIterations] — scroll cycles with no targets before stop (default 20)
   * @param {boolean} [spec.postSuccessScroll] — nudge scroll after each success so next tweet/row can appear
   * @param {function(Element): Promise<boolean>} [spec.performClick] — default safeClick
   */
  TaskRunner.prototype._runActionTask = async function (norm, spec) {
    var taskEpoch = ++this._epoch;
    var maxActions = norm.maxActions;
    var delayMinMs = norm.delayMinMs;
    var delayMaxMs = norm.delayMaxMs;
    var longEvery = norm.longPauseEvery;
    var longMin = norm.longPauseMinMs;
    var longMax = norm.longPauseMaxMs;

    _taskMeta.taskType = (norm.taskType || spec.actionLabel || "").toLowerCase();
    _taskMeta.startedAt = Date.now();
    _taskMeta.maxActions = maxActions;

    var actionDelay = spec.flatDelay
      ? function (lo, hi) {
          return Quilt.delayApi.sleep(Quilt.delayApi.randomInt(lo, hi));
        }
      : function (lo, hi) {
          return Quilt.delayApi.randomDelay(lo, hi);
        };

    var effPerDay = norm.maxPerDay;
    if (effPerDay != null) {
      effPerDay = await Quilt.storageApi.getWarmupAdjustedMaxPerDay(effPerDay);
    }

    this._limiter = new Quilt.RateLimiter({
      maxPerRun: maxActions,
      maxPerDay: effPerDay,
    });

    var session = Quilt.sessionApi.createRuntime();
    var failStreak = 0;
    var cancel = this._isCancelled.bind(this);

    emitStatus("running", spec.actionLabel + " task started", {
      maxActions: maxActions,
      completed: 0,
    });

    try {
      var done = 0;
      var processed = await spec.loadProcessed();
      var emptyStreak = 0;
      var maxEmptyIterations =
        typeof spec.maxEmptyIterations === "number" && spec.maxEmptyIterations > 0
          ? spec.maxEmptyIterations
          : 20;

      while (!this._cancelled && done < maxActions) {
        await Quilt.cooldownApi.waitUntilClear(cancel, function (remainingMs) {
          var mins = Math.ceil(remainingMs / 60000);
          emitStatus(
            "running",
            "Rate limited \u2014 resuming in " + mins + " min",
            { phase: "cooldown_wait", remainingMs: remainingMs }
          );
        });
        if (this._cancelled) break;

        if (Quilt.domActionsApi.detectRateLimitUi()) {
          await Quilt.cooldownApi.enterCooldown("rate_limit_ui");
          emitStatus("running", "Rate limit message seen; cooling down");
          continue;
        }

        await this._waitIfPaused();
        if (this._cancelled) break;

        if (!spec.flatDelay) {
          await Quilt.humanizerApi.randomIdleBreakMaybe(0.1, cancel);
          if (this._cancelled) break;

          await session.maybeFatigueBreak(cancel);
          if (this._cancelled) break;
        }

        var check = await this._limiter.canProceed();
        if (!check.ok) {
          emitStatus("stopped", "Limit: " + check.reason, {
            reason: check.reason,
          });
          break;
        }

        var buttons = spec.getButtons(processed);
        if (!buttons.length) {
          emptyStreak += 1;
          emitStatus(
            "running",
            "No " +
              spec.actionLabel.toLowerCase() +
              " targets; scrolling (" +
              emptyStreak +
              "/" +
              maxEmptyIterations +
              ")"
          );

          if (emptyStreak >= maxEmptyIterations) {
            var stopMsg =
              done === 0
                ? "No " + spec.actionLabel.toLowerCase() +
                  " targets found \u2014 quilt may need an update, or the page layout changed"
                : "Stopped: no " + spec.actionLabel.toLowerCase() +
                  " targets after " + maxEmptyIterations + " scroll attempts";
            emitStatus("stopped", stopMsg, { completed: done });
            break;
          }

          if (spec.flatDelay) {
            if (emptyStreak % 3 === 1) {
              await Quilt.domActionsApi.scrollFeed();
            }
            await Quilt.delayApi.sleep(Quilt.delayApi.randomInt(1500, 3000));
          } else {
            var snap = {
              articles: Quilt.domActionsApi.countTimelineArticles(),
              followButtons: Quilt.domActionsApi.countFollowButtonsTotal(),
              userCells: Quilt.domActionsApi.countUserCellsTotal(),
            };
            await Quilt.domActionsApi.scrollFeedHuman();
            await Quilt.delayApi.randomDelay(
              Math.min(delayMinMs, 700),
              Math.min(delayMaxMs, 2800)
            );
            await Quilt.domActionsApi.waitForNewContent(snap, 12000);
            await actionDelay(delayMinMs, delayMaxMs);
          }
          continue;
        }

        emptyStreak = 0;

        var btn = buttons[0];
        var id = spec.getTargetId(btn);
        var label = id || "(unknown)";

        Quilt.debugApi.log(
          "Found",
          buttons.length,
          spec.actionLabel.toLowerCase() + " button(s); clicking",
          label
        );
        emitStatus(
          "running",
          typeof statusMessageBuilder().formatAttemptingMessage === "function"
            ? statusMessageBuilder().formatAttemptingMessage(spec.actionLabel, label)
            : "Attempting " + spec.actionLabel.toLowerCase() + ": " + label,
          { completed: done, target: label, phase: "attempting" }
        );

        var followNetPromise =
          typeof spec.beginFollowNetworkWait === "function"
            ? spec.beginFollowNetworkWait()
            : undefined;

        var performClick =
          typeof spec.performClick === "function"
            ? spec.performClick
            : function (el) {
                return Quilt.domActionsApi.safeClick(el);
              };
        var clickResult = await performClick(btn);
        var clickMeta =
          clickResult && typeof clickResult === "object" && !Array.isArray(clickResult)
            ? clickResult
            : null;
        var ok = clickMeta ? !!clickMeta.ok : !!clickResult;
        if (clickMeta && clickMeta.mode === "request") {
          emitStatus(
            "running",
            "Direct " +
              spec.actionLabel.toLowerCase() +
              " request: " +
              label,
            {
              completed: done,
              target: label,
              phase: "request",
              requestStatus: clickMeta.requestStatus,
            }
          );
        }
        if (clickMeta && clickMeta.error === "rate_limited") {
          Quilt.debugApi.log("API 429 rate limit hit for", label);
          emitStatus(
            "running",
            "API rate limit (429); cooling down ~5 min",
            { completed: done, target: label, phase: "rate_limited" }
          );
          await Quilt.cooldownApi.enterRateLimitCooldown("api_429");
          continue;
        }
        if (!ok) {
          Quilt.debugApi.log("safeClick failed for", label);
          failStreak += 1;
          emitStatus(
            "running",
            typeof statusMessageBuilder().formatClickFailedMessage === "function"
              ? statusMessageBuilder().formatClickFailedMessage(
                  spec.actionLabel,
                  label,
                  failStreak
                )
              : spec.actionLabel + " click failed for " + label,
            { completed: done, target: label, failStreak: failStreak, phase: "click_failed" }
          );
          Quilt.cooldownApi.noteFailure();
          Quilt.metricsApi.recordFailure();
          if (failStreak >= 4) {
            await Quilt.cooldownApi.enterCooldown("click_failures");
            failStreak = 0;
            emitStatus("running", "Cooling down after repeated click failures");
          }
          await actionDelay(delayMinMs, delayMaxMs);
          continue;
        }

        emitStatus(
          "running",
          typeof statusMessageBuilder().formatWaitingMessage === "function"
            ? statusMessageBuilder().formatWaitingMessage(spec.actionLabel, label)
            : "Waiting for " + spec.actionLabel.toLowerCase() + " confirmation: " + label,
          { completed: done, target: label, phase: "verifying" }
        );

        var verified = await spec.verifyAfterClick(btn, followNetPromise);
        if (!verified) {
          Quilt.debugApi.log("Effect not verified for", label);
          failStreak += 1;
          emitStatus(
            "running",
            typeof statusMessageBuilder().formatNotVerifiedMessage === "function"
              ? statusMessageBuilder().formatNotVerifiedMessage(
                  spec.actionLabel,
                  label,
                  failStreak
                )
              : spec.actionLabel + " not yet confirmed for " + label,
            {
              completed: done,
              target: label,
              failStreak: failStreak,
              phase: "not_verified",
            }
          );
          Quilt.cooldownApi.noteFailure();
          Quilt.metricsApi.recordFailure();
          if (failStreak >= 3) {
            await Quilt.cooldownApi.enterCooldown("no_effect");
            failStreak = 0;
          }
          await actionDelay(delayMinMs, delayMaxMs);
          continue;
        }

        failStreak = 0;
        await Quilt.cooldownApi.noteSuccessfulAction();

        Quilt.debugApi.log(
          "Clicked " + spec.actionLabel.toLowerCase() + " (verified):",
          label
        );

        if (typeof spec.updateProcessed === "function") {
          spec.updateProcessed(processed, id, btn);
        } else if (id) {
          processed.add(id);
        }
        await spec.saveProcessed(processed);
        await this._limiter.recordAction();
        Quilt.metricsApi.recordAction();
        session.onSuccessfulAction();
        done += 1;

        if (spec.flatDelay) {
          try {
            var fadeEl = null;
            if (typeof spec.getFadeTarget === "function") {
              fadeEl = spec.getFadeTarget(btn);
            } else if (btn && btn.cell) {
              fadeEl = btn.cell;
            }
            if (fadeEl) {
              fadeEl.style.setProperty("will-change", "opacity, max-height, margin, padding", "important");
              fadeEl.style.setProperty("transform", "translateZ(0)", "important");
              fadeEl.style.setProperty("pointer-events", "none", "important");
              fadeEl.style.setProperty("transition", "opacity " + FADE_OPACITY_DURATION + " ease-out", "important");
              fadeEl.style.setProperty("opacity", "0", "important");
              if (spec.removeAfterFade) {
                (function (el) {
                  setTimeout(function () {
                    try {
                      var h = el.offsetHeight;
                      var rect = el.getBoundingClientRect();
                      var scroller = Quilt.domActionsApi.getFeedScrollElement
                        ? Quilt.domActionsApi.getFeedScrollElement()
                        : null;
                      el.style.setProperty("max-height", h + "px", "important");
                      el.style.setProperty("overflow", "hidden", "important");
                      void el.offsetHeight;
                      el.style.setProperty(
                        "transition",
                        FADE_COLLAPSE_TRANSITION,
                        "important"
                      );
                      el.style.setProperty("max-height", "0px", "important");
                      el.style.setProperty("margin", "0", "important");
                      el.style.setProperty("padding", "0", "important");
                    } catch (e2) { /* ignore */ }
                    setTimeout(function () {
                      try {
                        if (scroller && rect.top < window.innerHeight) {
                          scroller.scrollTop = Math.max(0, scroller.scrollTop - h);
                        }
                        el.remove();
                      } catch (e3) { /* ignore */ }
                    }, FADE_REMOVE_DELAY_MS);
                  }, FADE_COLLAPSE_START_DELAY_MS);
                })(fadeEl);
              }
            }
          } catch (e) { /* ignore */ }
        }

        emitStatus(
          "running",
          spec.actionLabel + " " + done + " / " + maxActions,
          { completed: done }
        );

        var snapDbg = Quilt.metricsApi.getSnapshot();
        Quilt.debugApi.log("metrics actions/hour ~", snapDbg.actionsLastHour);

        if (spec.flatDelay && done > 0 && done % 5 === 0) {
          Quilt.debugApi.log("flatDelay: batch scroll after", done, "actions");
          await Quilt.domActionsApi.scrollFeed();
          await Quilt.delayApi.sleep(Quilt.delayApi.randomInt(1000, 2000));
        } else if (spec.postSuccessScroll) {
          Quilt.debugApi.log("postSuccessScroll: nudging feed after success");
          await Quilt.domActionsApi.scrollFeedHuman();
          await Quilt.delayApi.randomDelay(500, 2200);
        }

        if (
          longEvery > 0 &&
          done > 0 &&
          done % longEvery === 0 &&
          done < maxActions
        ) {
          Quilt.debugApi.log("Long pause after", done, "actions");
          await Quilt.delayApi.randomDelay(longMin, longMax);
        }

        if (done >= maxActions) break;

        await actionDelay(delayMinMs, delayMaxMs);
      }

      if (this._cancelled) {
        emitStatus("cancelled", "Task cancelled", { completed: done });
      } else if (done >= maxActions) {
        emitStatus("completed", "Reached max post amount", { completed: done });
      }
    } catch (e) {
      emitStatus("error", String(e && e.message ? e.message : e));
    } finally {
      if (this._epoch === taskEpoch) {
        this._running = false;
        this._limiter = null;
      }
      _taskMeta.taskType = null;
      _taskMeta.startedAt = 0;
      _taskMeta.maxActions = 0;
    }
  };

  TaskRunner.prototype.startFollowTask = async function (rawOpts) {
    if (this._running) {
      this.cancel();
    }
    this._running = true;
    this._cancelled = false;
    this._paused = false;

    var norm = Quilt.normalizeTaskStartPayload(rawOpts);
    var self = this;
    await self._runActionTask(norm, {
      actionLabel: "Follow",
      flatDelay: true,
      maxEmptyIterations: 40,
      postSuccessScroll: false,
      getButtons: function (set) {
        return Quilt.domActionsApi.getUserCellTargets(set);
      },
      getTargetId: function (target) {
        return target.path;
      },
      loadProcessed: function () {
        return Quilt.storageApi.getFollowedIdSet();
      },
      saveProcessed: function (set) {
        return Quilt.storageApi.saveFollowedIdSet(set);
      },
      performClick: function (target) {
        return Quilt.domActionsApi.performDirectFriendshipRequest(
          target.screenName,
          "follow"
        );
      },
      verifyAfterClick: function () {
        return Promise.resolve(true);
      },
    });
  };

  TaskRunner.prototype.startLikeTask = async function (rawOpts) {
    if (this._running) {
      this.cancel();
    }
    this._running = true;
    this._cancelled = false;
    this._paused = false;

    var norm = Quilt.normalizeTaskStartPayload(rawOpts);
    var self = this;
    await Quilt.delayApi.sleep(500);
    if (self._cancelled) return;
    await self._runActionTask(norm, {
      actionLabel: "Like",
      flatDelay: true,
      maxEmptyIterations: 60,
      postSuccessScroll: false,
      getFadeTarget: function (btn) {
        return Quilt.domActionsApi.getTweetArticle(btn);
      },
      getButtons: function (set) {
        return Quilt.domActionsApi.getLikeButtons(set);
      },
      getTargetId: function (el) {
        return Quilt.domActionsApi.getTweetIdFromLikeButton(el);
      },
      loadProcessed: function () {
        return Quilt.storageApi.getLikedTweetIdSet();
      },
      saveProcessed: function (set) {
        return Quilt.storageApi.saveLikedTweetIdSet(set);
      },
      performClick: (function () {
        var apiFails = 0;
        return function (btn) {
          var tid = Quilt.domActionsApi.getTweetIdFromLikeButton(btn);
          if (!tid) return { ok: false, mode: "request", error: "no_tweet_id" };
          return Quilt.domActionsApi.performDirectLikeRequest(tid).then(function (r) {
            if (r.ok) {
              apiFails = 0;
            } else {
              apiFails += 1;
              Quilt.debugApi.log("like API fail #" + apiFails, r.error, r.status);
            }
            return r;
          });
        };
      })(),
      verifyAfterClick: function () {
        return Promise.resolve(true);
      },
    });
  };

  TaskRunner.prototype.startUnfollowTask = async function (rawOpts) {
    if (this._running) {
      this.cancel();
    }
    this._running = true;
    this._cancelled = false;
    this._paused = false;

    var norm = Quilt.normalizeTaskStartPayload(rawOpts);
    var self = this;
    await self._runActionTask(norm, {
      actionLabel: "Unfollow",
      flatDelay: true,
      maxEmptyIterations: 30,
      postSuccessScroll: false,
      getButtons: function (set) {
        return Quilt.domActionsApi.getUserCellTargets(set);
      },
      getTargetId: function (target) {
        return target.path;
      },
      loadProcessed: function () {
        return Promise.resolve(new Set());
      },
      saveProcessed: function () {
        return Promise.resolve();
      },
      updateProcessed: function (set, id) {
        if (id) set.add(id);
        Quilt.storageApi.getFollowedIdSet().then(function (fSet) {
          if (fSet.has(id)) {
            fSet.delete(id);
            return Quilt.storageApi.saveFollowedIdSet(fSet);
          }
        }).catch(function (e) {
          Quilt.debugApi.log("updateProcessed (unfollow) storage error:", e);
        });
      },
      performClick: function (target) {
        return Quilt.domActionsApi.performDirectFriendshipRequest(
          target.screenName,
          "unfollow"
        );
      },
      verifyAfterClick: function () {
        return Promise.resolve(true);
      },
    });
  };

  TaskRunner.prototype.startUnlikeTask = async function (rawOpts) {
    if (this._running) {
      this.cancel();
    }
    this._running = true;
    this._cancelled = false;
    this._paused = false;

    var norm = Quilt.normalizeTaskStartPayload(rawOpts);
    var self = this;
    await Quilt.delayApi.sleep(500);
    if (self._cancelled) return;
    await self._runActionTask(norm, {
      actionLabel: "Unlike",
      flatDelay: true,
      removeAfterFade: true,
      maxEmptyIterations: 60,
      postSuccessScroll: false,
      getFadeTarget: function (btn) {
        return Quilt.domActionsApi.getTweetArticle(btn);
      },
      getButtons: function (set) {
        return Quilt.domActionsApi.getUnlikeButtons(set);
      },
      getTargetId: function (el) {
        return Quilt.domActionsApi.getTweetIdFromLikeButton(el);
      },
      loadProcessed: function () {
        return Promise.resolve(new Set());
      },
      saveProcessed: function () {
        return Promise.resolve();
      },
      updateProcessed: function (set, id) {
        if (id) set.add(id);
        Quilt.storageApi.getLikedTweetIdSet().then(function (likedSet) {
          if (likedSet.has(id)) {
            likedSet.delete(id);
            return Quilt.storageApi.saveLikedTweetIdSet(likedSet);
          }
        }).catch(function (e) {
          Quilt.debugApi.log("updateProcessed (unlike) storage error:", e);
        });
      },
      performClick: (function () {
        var apiFails = 0;
        return function (btn) {
          var tid = Quilt.domActionsApi.getTweetIdFromLikeButton(btn);
          if (!tid) return { ok: false, mode: "request", error: "no_tweet_id" };
          return Quilt.domActionsApi.performDirectUnlikeRequest(tid).then(function (r) {
            if (r.ok) {
              apiFails = 0;
            } else {
              apiFails += 1;
              Quilt.debugApi.log("unlike API fail #" + apiFails, r.error, r.status);
            }
            return r;
          });
        };
      })(),
      verifyAfterClick: function () {
        return Promise.resolve(true);
      },
    });
  };

  Quilt.taskRunner = new TaskRunner();
})();
