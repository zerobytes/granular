# context.js

## Purpose

`context(defaultValue)` shares a reactive state through a subtree without prop drilling.

## Returned API

- `scope(value?)`
- `state()`

## Provider model

`scope()` creates a provider signal and a state-like proxy around it.

The provider proxy also exposes:

- `serve(renderable)`

`serve()` wraps a child tree in a `ContextProvider` renderable.

## Consumer model

`state()` returns a state-like consumer object backed by:

- a local fallback signal
- an active provider signal when connected

Consumers can connect in two ways:

- during provider construction, through `providerStack`
- during mount-time rendering, through `mountStack`

That second path matters for branches created later by runtime nodes such as `when` and `list`.

## Important semantics

- consumers expose the same state-like surface as normal state
- the active provider can change
- fallback local value still exists even when no provider is connected

## Current nuance in the implementation

Consumer reads and writes are redirected to the active provider when connected, but the adapter's `before` hook is still wired to the local fallback signal.

That means the consumer looks state-like end to end, but its guard path is not fully symmetric with provider-backed reads and writes yet.

## Design implication

Context in Granular is not a rerender propagation mechanism. It is a signal/state rebinding mechanism.
