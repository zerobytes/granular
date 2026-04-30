# context.js

## Purpose

`context(defaultValue)` shares a reactive state through a subtree without prop drilling.

## Returned API

- `scope(value?)` - opens a provider level; `value` defaults to `defaultValue`
- `state()` - returns a state-like consumer bound to the nearest ancestor provider

## Provider model

`scope()` creates a provider signal and a state-like proxy around it.

The provider proxy also exposes:

- `serve(...children)` - flattens array children and wraps the subtree in a `ContextProvider` renderable

`ContextProvider` is a `Renderable`:

- on `mountInto`, it connects every queued consumer to the provider signal, pushes itself on `mountStack` while children mount (so descendant `state()` calls bind to it), then pops
- on `unmount`, it disconnects construction-time and mount-time consumers and removes the provider entry from `providerStack`
- `renderToString(render)` is implemented for SSR: it connects consumers, joins child output, then pops

## Consumer model

`state()` returns a state-like consumer object backed by:

- a local fallback signal, used when no provider is connected
- an active provider signal once connected

Consumers can connect in three ways:

- during mount-time rendering, through `mountStack` (top wins)
- during provider construction, through `providerStack`
- otherwise the consumer is queued in `pending` and connected by the next `serve()`

That mount-time path matters for branches created later by runtime nodes such as `when` and `list`.

## Important semantics

- consumers expose the same state-like surface as normal state
- the active provider can change; `_connect` is idempotent for the same signal and emits a notify when the value differs from the previous one
- on `_disconnect`, the consumer falls back to the local signal and re-subscribes to it
- the local fallback value still exists even when no provider is connected

## Current nuance in the implementation

Consumer reads and writes are redirected to the active provider when connected, but the adapter's `before` hook is still wired to the local fallback signal.

That means the consumer looks state-like end to end, but its guard path is not fully symmetric with provider-backed reads and writes yet.

## Design implication

Context in Granular is not a rerender propagation mechanism. It is a signal/state rebinding mechanism.
