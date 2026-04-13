# query-client.js

## Purpose

`QueryClient` is the fetch/cache/refetch manager in the core.

## Query model

Each query instance stores reactive state with:

- `data`
- `error`
- `status`
- `fetching`
- `updatedAt`
- `errorAt`
- `invalidated`

## Implemented query behaviors

- keyed cache
- stale detection
- in-flight dedupe
- retry with backoff
- abort via `AbortController`
- garbage collection by `cacheTime`
- refetch on focus
- refetch on reconnect
- explicit invalidate/refetch/remove

## Subscriptions

Queries expose:

- `state()`
- `getState()`
- `setState(partial)`
- `subscribe(listener)`
- `subscribe(selector, listener, equalityFn)`

## Service layer

`service(config)` builds endpoint wrappers on top of fetch.

Already implemented:

- path param interpolation
- query string building
- plain-object JSON body handling
- middleware composition
- response parsing by content type
- endpoint-local mapping

## Design implication

This module is not a hook wrapper over fetch. It is a reactive cache object model with an HTTP service builder layered on top.

