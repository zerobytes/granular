# devtools-hook.js

## Purpose

`devtools-hook.js` exposes a global object that an external devtools surface (browser extension, panel, test harness) can pick up to observe reactive scheduling without coupling to the framework module graph.

## Public surface

- `installDevtoolsHook()` returns the hook (or `null` if no global is reachable)
- `DEVTOOLS_HOOK_KEY` is the string `__GRANULAR_DEVTOOLS_HOOK__`

## Internal model

Install target resolution: `window` if defined, else `globalThis`, else `null`. The hook is stored as `target[DEVTOOLS_HOOK_KEY]`. A second call returns the existing hook, so install is idempotent across module reloads.

The hook object exposes:

- `version: 1`
- `profiler` — the singleton from `./reactivity/profiler.md`
- `isAttached()` — true while subscribed to the profiler
- `attach()` / `detach()`
- `onEvent(fn)` — local listener, returns an unsubscribe
- `snapshot()` — `{ events, stats, topByHost, recentEvents }` pulled from the profiler plus the local ring buffer
- `reset()` — clears profiler state and the ring buffer

A 200-entry ring buffer (`recentEvents`) is maintained internally so a late-attaching panel can read recent activity without missing it on the wire.

## Behavior

`attach()` enables the profiler with `{ maxEvents: 5000 }` if it is not already enabled, then subscribes. For each event it pushes into the ring buffer, broadcasts to local `listeners`, and emits a window message:

```js
target.postMessage({ source: 'granular-devtools', kind: 'event', event }, '*')
```

The `postMessage` call is wrapped in `try/catch` and silently dropped on environments where it is unavailable (non-DOM globals).

On install, a one-shot announcement is posted:

```js
{ source: 'granular-devtools', kind: 'hook-installed', version: 1 }
```

`detach()` only unsubscribes from the profiler; it does not disable the profiler itself, so any other consumer (such as `./dev.md`) keeps receiving events.

When no devtools client is listening, the hook still installs, `attach()` is never called, and the runtime cost is the property assignment plus the install message — no subscription to the profiler exists, so scheduling is uninstrumented.

## Composition

- The event stream is whatever `./reactivity/profiler.md` produces, which in turn reflects the `onSchedule` / `onFlushStart` / `onFlushEnd` calls made by `./reactivity/scheduler.md`.
- Independent of `./reactivity/dev-hooks.md`: the devtools hook only observes scheduling, not coercion warnings.
- Coexists with `./dev.md`, but both write to `scheduler.setProfiler`. If `enableDevMode()` runs after `attach()` and `profiler` was already enabled, the flush-guard stub replaces the profiler in the scheduler slot and `attach()`'s subscription stops receiving new schedule/flush events until reinstalled.

## Design implication

The hook is a pull-side integration point: it does not require devtools to be present, it does not change runtime behavior when idle, and it never leaks framework internals into the public runtime — external tooling sees only profiler events and the snapshot API.
