# dev.js

## Purpose

`dev.js` is the opt-in development-mode harness. It does not change runtime semantics; it instruments the existing reactive primitives so misuse becomes visible as console warnings.

## Public surface

- `enableDevMode(options?)` returns `{ disable }`
- `clearDevWarnings()` empties the dedup set
- re-exports `profiler` from `./reactivity/profiler.md`

## Options

Defaults applied to a module-level `opts` record:

- `proxyCoercion: true`
- `flushLoops: true`
- `unhandledRejections: true`
- `flushLoopThreshold: 50`
- `slowFlushMs: 16`
- `warnOnce: true`
- `trace: false`

## Behavior

`enableDevMode` is idempotent: a second call short-circuits and returns a no-op `disable`. On first call it merges options, clears the dedup set, then conditionally installs three hooks:

- `installCoercionHook()` calls `setDevHooks({ onCoerce })` against `./reactivity/dev-hooks.md`. It maps the `hint` argument (`string`/`valueOf`, `number`, `default`) to a worded warning telling the user to prefer `.get()`, `after()`, `derive()`, `cls\`...\``, or `tpl\`...\``.
- `installFlushGuard()` calls `scheduler.setProfiler(...)` from `./reactivity/scheduler.md` with a profiler stub that ignores `onSchedule`/`onFlushStart` and uses `onFlushEnd(host, elapsed)` to detect two conditions: more than `flushLoopThreshold` flushes within a 16ms window (re-entrant update loop), and any single flush exceeding `slowFlushMs`.
- `installRejectionHandler()` attaches `unhandledrejection` on `window` if available, otherwise `process.on('unhandledRejection', ...)`.

After the hooks, it calls `profiler.enable()` and logs a one-shot info line. Note: `profiler.enable()` itself calls `scheduler.setProfiler(this)`, which replaces the flush-guard stub installed above unless the profiler was already enabled.

`emitWarning(key, message)` deduplicates by `key` when `warnOnce` is true. With `trace: true` it appends `new Error().stack`.

`disable()` clears `installed`, calls `setDevHooks(null)`, `scheduler.setProfiler(null)`, `profiler.disable()`, and clears the dedup set, leaving the runtime free of dev instrumentation.

`clearDevWarnings()` only resets the dedup set, so previously suppressed warnings can fire again.

## Composition

- Coercion warnings come through `./reactivity/dev-hooks.md`, which is the only seam reactive primitives expose for dev observation.
- Flush diagnostics rely on the same profiler slot used by `./reactivity/profiler.md` and `./reactivity/scheduler.md`.
- The hook installed here is independent of `./devtools-hook.md`; both can coexist, but they compete for `scheduler.setProfiler` and the last writer wins.

## Design implication

Dev mode is a build-time concern. Nothing in the runtime references it; production builds simply omit the call to `enableDevMode` and the reactive core stays uninstrumented at zero cost.
