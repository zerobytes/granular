# dev-hooks.js

## Purpose

`dev-hooks.js` is the indirection layer that lets dev mode and devtools observe reactive misuse without coupling the primitives to any dev-only code. In production it is a pair of `null` references and a fast no-op call path.

## Exports

- `setDevHooks(hooks)`
- `notifyCoerce(kind, source, hint)`
- `notifyUntrackedRead(source, path)`
- `devHooksEnabled()`

## Internal model

Two module-level slots:

- `onCoerce` — callback for implicit coercion events
- `onUntrackedRead` — callback for reads that happened outside any active tracker

Both default to `null`. `setDevHooks(hooks)` reassigns them using `hooks?.onCoerce ?? null` and `hooks?.onUntrackedRead ?? null`, so passing `null`, `undefined`, or a partial object all work as expected for clearing or replacing individual hooks.

## Dispatch model

- `notifyCoerce(kind, source, hint)` calls `onCoerce(kind, source, hint)` only when `onCoerce` is not null
- `notifyUntrackedRead(source, path)` calls `onUntrackedRead(source, path)` only when `onUntrackedRead` is not null
- `devHooksEnabled()` returns true if either hook is registered

There is no error guard around the hook invocations; consumers are expected to be the dev-mode shell, which controls the callback shape.

## Hook payloads

`notifyCoerce` is called from the `Symbol.toPrimitive` proxy traps in `signal.js` and `state.js` with:

- `kind` — `'signal'` or `'state'`
- `source` — the proxy being coerced
- `hint` — one of `'string'`, `'valueOf'`, `'number'`, `'default'`

`notifyUntrackedRead` has the public shape `(source, path)` but is currently not invoked anywhere in the core. It exists as a forward-compatible slot for the dev shell.

## Composition

- `dev.js` — `enableDevMode()` calls `setDevHooks({ onCoerce })` from `installCoercionHook`. The `onCoerce` handler emits one warning per `(kind, hint)` pair via `console.warn`, switching message text on `hint`. `disable()` calls `setDevHooks(null)` to restore the no-op state.
- `devtools-hook.js` — does not register dev hooks. It only attaches to the `profiler` event stream and forwards events through `window.postMessage` and an in-memory subscriber set. The two surfaces are independent: dev hooks observe primitive misuse, the devtools hook observes scheduler activity.

## Design implication

The module is intentionally minimal. The cost of an inactive hook is one `null` comparison per call, which is the price `signal` and `state` pay on every implicit coercion in production builds.
