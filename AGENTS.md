# Agent memory (Quilt)

## Learned User Preferences

- Prefer rate-limit and error detection scoped to dialogs, sheets, or alerts—not substring scans over all of `document.body` on x.com, which often matches unrelated copy and blocks the runner.
- When behavior looks like "quota ran out" but scrolls dominate wall time, confirm whether the code counts only successful engagements before raising limits or delays.
- Do not add unsolicited debugging surface (extra console logging, ad-hoc debug UI, or noisy instrumentation) unless the user explicitly asks for it.
- Task start must unambiguously select **Follow** vs **Like** vs **Unfollow** (consistent `taskType` / popup → content payload) so the wrong runner never runs without a clear error.
- Superpowers for X is the UX reference for follow/unfollow timing and behavior: 4–8 second flat delay between each `create.json`/`destroy.json`, 5-minute pause on rate-limit exceeded, sequential one-at-a-time requests. Match this cadence rather than inventing alternative timing.
- Start must always work regardless of prior state—auto-cancel stale tasks rather than blocking with "Already running." Never require the user to manually reload the page to recover from a stuck task runner.
- Status messages visible to the user must be definitive and non-technical. Show countdowns ("Rate limited — 12 min left"), not vague guesses ("might be rate limited") or silent hangs with no feedback.
- For direct API operations (follow/unfollow), use flat random delays that respect user min/max bounds exactly. The `humanizer.js` weighted-bucket override of `randomDelay` violates those bounds (12% chance of sub-second delay, 16% chance of 10–28 s) and causes request spam.

## Learned Workspace Facts

- Quilt is a Manifest V3 Chrome extension implemented as vanilla JS under `extension/`; content script load order in `manifest.json` is required for globals (`Quilt.*`) to initialize correctly.
- DOM automation on x.com prefers `data-testid` (e.g. follow, like) over class-based selectors.
- Per-run **max post amount** (stored as `norm.maxActions`) increments only on successful verified likes, follows, or unfollows for the active task; scrolls, waits, and failed or unverified actions do not consume that budget.
- `chrome.storage.local` holds followed/liked ID sets, daily session counters, debug enablement, cooldown state, and first-seen timestamp used for warmup caps.
- After a successful action the runner nudges the feed (`postSuccessScroll`). Like tasks use higher empty-iteration tolerance, accept `aria-pressed="true"` / `data-testid="unlike"` / unlike controls inside tweet articles with multiple short retries. Stopping for "no targets" does not enter cooldown.
- Treat controls with `position: fixed` or `sticky` as visible when they intersect the viewport; do not rely on `offsetParent` alone for visibility.
- **Follow:** `getFollowSearchRoot` uses **`document.body`** on home so **Who to follow** (right rail / `data-testid="wtf"`) is scanned; other **sidebarColumn** follows stay excluded.
- **Follow/Unfollow is direct-request**: `getUserCellTargets` scans `[data-testid="UserCell"]` / `cellInnerDiv` / `[role="listitem"]` cells, extracts `screen_name` from profile links, and `performDirectFriendshipRequest` fires `friendships/create.json` or `destroy.json` via the MAIN-world bridge (`pageWorldFollowTap.js`). On HTTP 429, returns `error: "rate_limited"` and the task runner enters `enterRateLimitCooldown` immediately. Verification parses the API response body (`screen_name` match + no `errors` array). The like task is untouched and still uses DOM click + `verifyLikeEffect`. Unfollow is scoped to `quilt_followed_ids`.
- `pageWorldFollowTap.js` intercepts XHR/fetch for `friendships/create` and `friendships/destroy`, posting tokened `quiltXhr` messages. It also handles `FRIENDSHIP_REQUEST` bridge messages to execute direct `window.fetch` calls with page auth context. `user_flow.json` is not a reliable success signal.
- `TaskRunner.cancel()` force-clears `_running` and uses an epoch counter so stale async loops cannot clobber a new task's state in their `finally` block. Starting a new task auto-cancels any previous one.
- `badges.js` injects floating action badges (Like, Follow All, Unfollow) into x.com pages, fixed top-right. Clicks send `TASK_START`/`TASK_STOP` through `chrome.runtime.sendMessage` (same path as popup). Status updates via `chrome.storage.onChanged` are mapped to user-friendly text; `cooldownApi.waitUntilClear` accepts an `onWaiting` callback for periodic countdown emission.
