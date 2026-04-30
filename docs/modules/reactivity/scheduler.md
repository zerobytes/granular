# scheduler.js

## Purpose

`scheduler` is the singleton flush coordinator for hosts that batch their own dirty work. It owns the priority queues and decides whether a flush runs synchronously or on the next microtask.

## Exports

- `scheduler` — singleton instance of the internal `Scheduler` class
- `FLUSH_HOOK` — `Symbol('granular.scheduler.flush')` used as the well-known method name a host must implement

## Public surface

- `schedule(host, priority = 'normal')`
- `unschedule(host)`
- `isScheduled(host)`
- `flushSync()`
- `flushAll()`
- `setProfiler(profiler)`
- `stats()` → `{ flushes, flushedHosts, pending }`

## Queue model

Three fixed priority queues, declared in `PRIORITIES` order:

1. `sync`
2. `normal`
3. `idle`

Each queue is a `Set`, so `schedule(host, p)` is idempotent — re-scheduling a host that is already in the same queue is a no-op. Unknown priority strings are silently downgraded to `'normal'`.

`unschedule(host)` removes the host from every queue. `isScheduled(host)` returns true if any queue contains it.

## Flush phases

`flushAll()` is the round-robin drain:

- guarded by `#flushing` so it cannot run re-entrantly
- repeatedly walks `PRIORITIES` in order, calling `#flushOnce(priority)` for each
- bails after 1000 outer iterations and logs `[granular] Scheduler safety limit hit; possible infinite update loop.`

`#flushOnce(priority)` snapshots the queue, clears it, and invokes `host[FLUSH_HOOK]()` for every entry. New schedules issued during a flush land in the (now empty) queue and are picked up by the next round.

`flushSync()` only runs `#flushOnce('sync')`; it does not drain `normal` or `idle`.

Errors thrown from a host's flush are caught and reported via `console.error('[granular] Error during scheduled flush:', err)`. Other hosts in the same batch still run.

## Microtask vs sync paths

`#requestFlush(priority)` is called once per `schedule()`:

- if a flush is already scheduled (`#flushScheduled`), it returns immediately — this is what makes microtask batching work
- if `priority === 'sync'`, it sets the scheduled flag and calls `flushAll()` synchronously, then clears the flag in `finally`
- otherwise it sets the flag and `queueMicrotask(() => { #flushScheduled = false; flushAll(); })`

A `'sync'` schedule therefore drains every queue immediately, including pending `normal` and `idle` work, not just the sync queue.

## Profiler integration

`setProfiler(profiler)` plugs in an object that may implement:

- `onSchedule(host, priority)` — fired from `schedule()`
- `onFlushStart(host)` — fired before each `host[FLUSH_HOOK]()`
- `onFlushEnd(host, elapsed)` — fired after, with `performance.now()` delta

All three calls are guarded by optional chaining, so a partial profiler is fine. When no profiler is registered the scheduler does no timing work.

This is the same hook used by `profiler.js` and by `dev.js`'s flush guard.

## Composition

- `dirty-host.js` is the only core consumer of `scheduler.schedule(this)` and the `[FLUSH_HOOK]()` method. `DirtyHost` calls `schedule(this)` from `#scheduleFlush()` after marking a property dirty, and its `[FLUSH_HOOK]()` calls `update()`.
- `observe.js` and `state.js` do not go through the scheduler; they batch via their own `queueMicrotask` calls and direct subscriber invocation.
- `profiler.js` calls `scheduler.setProfiler(this)` on `enable()` and `setProfiler(null)` on `disable()`.

## Design implication

The scheduler is a generic priority-queue flush gate, not a global reactivity engine. It only sees hosts that explicitly opt in by implementing `[FLUSH_HOOK]` and calling `scheduler.schedule(this)`.
