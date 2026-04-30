# profiler.js

## Purpose

`profiler` is the runtime sink for scheduler activity. It buffers events, accumulates aggregate stats, and forwards each event to subscribers — used by `enableDevMode` and by the devtools hook.

## Exports

- `profiler` — singleton instance of the internal `Profiler` class

## Public surface

- `enable(options?)` — `options.maxEvents` overrides the ring-buffer cap (default `5000`); idempotent
- `disable()` — idempotent
- `isEnabled()`
- `reset()` — clears events and resets stats
- `subscribe(fn)` — returns an unsubscribe function
- `events()` — returns a copy of the current event buffer
- `stats()` — returns a copy of `{ schedules, flushes, flushTime, hostsFlushed }`
- `summarizeRecent(timeWindowMs = 1000)` — aggregates `flush:end` events in the window

Scheduler callback surface (called by `scheduler` after `setProfiler(this)`):

- `onSchedule(host, priority)`
- `onFlushStart(host)`
- `onFlushEnd(host, elapsed)`

## Enable / disable lifecycle

`enable()` sets the enabled flag, applies `maxEvents`, and calls `scheduler.setProfiler(this)`. `disable()` clears the flag and calls `scheduler.setProfiler(null)`. Re-enabling does not reset the buffer; `reset()` is the explicit clear.

When disabled, the three `on*` callbacks return early without recording or notifying, even if the scheduler still calls them during the same tick.

## Recorded events

Every event has `{ type, time, host }` plus type-specific fields. `time` comes from `performance.now()` when available, else `Date.now()`.

- `schedule` — `{ priority }`
- `flush:start` — no extra fields
- `flush:end` — `{ elapsed }` in milliseconds

`host` is labelled by `host.constructor?.name` if present, else `typeof host`, else `'unknown'`.

## Sampling and storage

Events are pushed into an array capped at `maxEvents`. When the cap is exceeded, the oldest entries are spliced out so the buffer stays trimmed to `maxEvents` from the tail.

`stats` is updated incrementally:

- `schedules++` on every `onSchedule`
- `flushes++` and `hostsFlushed++` on every `onFlushEnd`
- `flushTime += elapsed` on every `onFlushEnd`

## Subscribers

`subscribe(fn)` registers a listener invoked on `schedule` and `flush:end` events (not `flush:start`). Listener errors are caught and swallowed individually so one bad subscriber does not break the others.

## `summarizeRecent(timeWindowMs)`

Filters the event buffer to entries with `time >= now - timeWindowMs`, keeps only `flush:end`, groups by `host` label, and returns an array of `{ host, count, totalTime, avgTime }` sorted by `totalTime` descending.

## Composition

- `dev.js` — `enableDevMode()` calls `profiler.enable()` and installs its own scheduler profiler via `scheduler.setProfiler(...)`. The latter overrides the profiler's own scheduler binding while dev mode is active; `disable` restores by calling `profiler.disable()` and `scheduler.setProfiler(null)`.
- `devtools-hook.js` — `installDevtoolsHook()` calls `profiler.enable({ maxEvents: 5000 })` if not already enabled, then `profiler.subscribe(...)` to forward each event over `window.postMessage` and to its own listener set. Its `snapshot()` exposes `profiler.events()`, `profiler.stats()`, and `profiler.summarizeRecent(2000)`.

## Design implication

The profiler is a passive observer of the scheduler. It owns no timing logic of its own — `elapsed` arrives from the scheduler — and its only side effect outside its own state is the `setProfiler` registration.
