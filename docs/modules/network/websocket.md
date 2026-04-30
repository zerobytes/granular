# websocket.js

## Purpose

`WebSocketClient` is the reactive websocket runtime object. `createWebSocket(options)` is a thin factory.

## Constructor options

- `url` (required for `connect()`)
- `protocols` - passed straight to `new WebSocket`
- `serialize(value)` - default JSON-stringifies non-string/binary values
- `parse(data)` - default returns the raw `event.data`
- `reconnect` - default `true`
- `maxRetries` - default `Infinity`
- `reconnectDelay(attempt)` - default exponential backoff `min(1000 * 2^(attempt-1), 10_000)`
- `autoConnect` - default `true`

## State model

`state()` returns a reactive state with:

- `status` - `'idle'`, `'connecting'`, `'open'`, `'closed'`
- `connected` - boolean
- `reconnecting` - boolean
- `attempts` - retry counter
- `lastMessage` - last parsed payload
- `lastError` - last error event or thrown parse error

## Methods

- `connect()` - throws if `url` is missing; no-op when already OPEN/CONNECTING
- `close(code, reason)` - sets a manual-close flag so reconnect is skipped, clears any pending reconnect timer
- `send(value)` - throws when socket is not OPEN; runs `before('send')` (cancellable), serializes, sends, then `after('send')`
- `setUrl(next)` - swaps the URL used by the next `connect()`
- `state()` - returns the reactive state object
- `before()` / `after()` - return phase APIs from the internal `EventHub`

## Event flow

Before hooks can gate:

- incoming `message`
- outgoing `send`

After hooks emit:

- `open`
- `message`
- `error` - including parse failures
- `close`
- `reconnect` - payload `{ attempt, delay }`
- `send`

## Reconnect behavior

- triggered from the `close` listener when `reconnect` is true and `close()` was not user-initiated
- bounded by `maxRetries`; `attempts` is reset to `0` on `open`
- a single timer is kept; concurrent schedules are ignored

## Design implication

The websocket client follows the same Granular pattern as the rest of the runtime: an explicit object with reactive state plus phase hooks, not a hook-shaped abstraction.
