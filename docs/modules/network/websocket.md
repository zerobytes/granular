# websocket.js

## Purpose

`WebSocketClient` is the reactive websocket runtime object.

## State model

The client keeps a reactive state with:

- `status`
- `connected`
- `reconnecting`
- `attempts`
- `lastMessage`
- `lastError`

## Features implemented

- `connect()`
- `close()`
- `send(value)`
- `setUrl(next)`
- reconnect with backoff
- configurable serializer and parser
- `before()` and `after()` event phases

## Event flow

Before hooks can gate:

- incoming `message`
- outgoing `send`

After hooks emit:

- `open`
- `message`
- `error`
- `close`
- `reconnect`
- `send`

## Design implication

The websocket client follows the same Granular pattern as the rest of the runtime: an explicit object with reactive state plus phase hooks, not a hook-shaped abstraction.

