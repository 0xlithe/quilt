# Agent memory (Quilt)

## Learned User Preferences

- Prefer rate-limit and error detection scoped to dialogs, sheets, or alerts—not substring scans over all of `document.body` on x.com, which often matches unrelated copy and blocks the runner.
- When behavior looks like "quota ran out" but scrolls dominate wall time, confirm whether the code counts only successful engagements before raising limits or delays.
- Do not add unsolicited debugging surface (extra console logging, ad-hoc debug UI, or noisy instrumentation) unless the user explicitly asks for it.
- Task start must unambiguously select **Follow** vs **Like** vs **Unfollow** vs **Unlike** (consistent `taskType` / popup → content payload) so the wrong runner never runs without a clear error.
- Start must always work regardless of prior state—auto-cancel stale tasks rather than blocking with "Already running." Never require the user to manually reload the page to recover from a stuck task runner.
- Status messages visible to the user must be definitive and non-technical. Show countdowns ("Rate limited — 12 min left"), not vague guesses ("might be rate limited") or silent hangs with no feedback.
- For direct API operations (follow/unfollow/like/unlike), use flat random delays that respect user min/max bounds exactly. The `humanizer.js` weighted-bucket override of `randomDelay` violates those bounds and causes request spam.
- Performance on x.com page load matters: defer heavy scripts (~109 KB) until a task is started; only bootstrap essentials (~11 KB) should load on every page.
- Prefer the Chrome side panel as the primary control surface over the popup. The sidebar should include live elapsed timer, progress bar, and task controls. A toggle in extension options controls whether the icon opens sidebar or popup.
- When the user requests a code review, cover four pillars: security, debugging/error-handling, hardcodes/duplication, and optimization/fluidity.

## Learned Workspace Facts

- Quilt is a Manifest V3 Chrome extension implemented as vanilla JS under `extension/`; content script load order is required for globals (`Quilt.*`) to initialize correctly.
- Only 5 bootstrap scripts are declared in `manifest.json` `content_scripts` (`messaging.js`, `storage.js`, `debug.js`, `delay.js`, `content.js`). The remaining 10 task scripts + badges are injected on demand by the background via `chrome.scripting.executeScript` on first `TASK_START` per tab.
- Because the extension may be reloaded without refreshing x.com, the background injects ALL content scripts (bootstrap + task) on `TASK_START`. Each script guards against double-initialization (`Quilt._contentListenerInstalled`, `Quilt._badgesInstalled`) so re-injection is safe.
- DOM automation on x.com prefers `data-testid` (e.g. follow, like) over class-based selectors.
- Per-run **max post amount** (stored as `norm.maxActions`) increments only on successful verified likes, follows, or unfollows for the active task; scrolls, waits, and failed or unverified actions do not consume that budget.
- `chrome.storage.local` holds followed/liked ID sets, daily session counters, debug enablement, sidebar preference, cooldown state, and first-seen timestamp used for warmup caps.
- **Follow/Unfollow** uses direct API requests: `getUserCellTargets` scans cells, extracts `screen_name`, and `performDirectFriendshipRequest` fires `friendships/create.json` or `destroy.json` via the MAIN-world bridge. Unfollow is scoped to `quilt_followed_ids`.
- **Like/Unlike** uses direct GraphQL API requests (`FavoriteTweet` / `UnfavoriteTweet`) via the MAIN-world bridge, not DOM clicks. Query IDs are captured dynamically and have hardcoded fallbacks in `followWireShared.js`.
- `pageWorldFollowTap.js` runs in the MAIN world, patches `fetch`/`XHR` to intercept friendship and GraphQL requests, and handles bridge messages for direct API calls. It is injected on demand (not on page load).
- `TaskRunner.cancel()` force-clears `_running` and uses an epoch counter so stale async loops cannot clobber a new task's state. `emitStatus` payloads include `taskType`, `startedAt`, `completed`, and `maxActions` for the side panel timer.
- The Chrome side panel (`sidepanel.html` / `sidepanel.js`) is the primary UI, controlled by `quilt_sidebar_on_click` storage key. When enabled (default), the toolbar icon opens the side panel; when disabled, it opens the popup. The background dynamically calls `chrome.action.setPopup` and `chrome.sidePanel.setPanelBehavior` to switch.
- Extension options page (`options.html`) hosts the sidebar toggle and debug logging checkbox, keeping these settings out of the main UI.
