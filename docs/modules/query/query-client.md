# query-client.js

## Purpose

`QueryClient` is the fetch/cache/refetch manager in the core.

## Public surface

- `query(options)` - get-or-create the `Query` for a key
- `invalidate(key)` - mark cached query stale (and refetch when configured)
- `refetch(key)` - force a refetch on the cached query
- `remove(key)` - cancel and evict
- `use(middleware)` - register a global middleware; returns an unregister function
- `service(config)` - build an HTTP endpoint API on top of fetch

## Query options

- `key` - `QueryKey`, normalized through `JSON.stringify(Array.isArray(key) ? key : [key])`
- `fetcher({ key, signal })` - required async fetcher
- `staleTime` - ms, default `0` (always stale)
- `cacheTime` - ms, default `5 * 60_000`; controls GC after refCount drops to `0`
- `refetchOnFocus` - default `true`
- `refetchOnReconnect` - default `true`
- `retry` - default `0`; total attempts = `retry + 1`
- `retryDelay(attempt)` - default `250 * 2^(attempt-1)` ms
- `dedupe` - default `true`; concurrent calls share the in-flight promise
- `refetchOnInvalidate` - default `true`

## Query state

Each `Query` instance stores reactive state with:

- `data`
- `error`
- `status` - `'idle' | 'loading' | 'success' | 'error'`
- `fetching`
- `updatedAt`
- `errorAt`
- `invalidated`

## Implemented query behaviors

- keyed cache
- stale detection (`updatedAt`, `staleTime`, `invalidated`)
- in-flight dedupe via shared promise
- retry with backoff, abortable through `AbortController`
- refCount-based GC: when subscribers drop to `0`, a `cacheTime` timer evicts the entry and aborts in-flight
- refetch on `window.focus` and `window.online` (when `refetchOnFocus` / `refetchOnReconnect`)
- explicit `invalidate()`, `refetch()`, `cancel()`, `ensure()` on the query

## Subscriptions

Queries expose:

- `state()`
- `getState()`
- `setState(partial)`
- `subscribe(listener)` - listener form
- `subscribe(selector, listener, equalityFn?)` - selector form, defaults equality to `Object.is`
- `isStale` getter

`subscribe()` increments the refCount and clears any pending GC; the returned unsubscribe decrements and reschedules GC.

## Service layer

`service(config)` builds endpoint wrappers on top of `fetch`.

`config`:

- `baseUrl` - prefixed to every URL
- `middlewares` - service-level middlewares
- `endpoints` - map of `name → { method, path, headers, query, map, middlewares }`

Each endpoint becomes `api[name](input)` where `input` may carry:

- `params` for `:placeholder` interpolation in `path`
- `query` (object → `URLSearchParams`, arrays append per item)
- `body` (plain objects are JSON-stringified with `Content-Type: application/json` if not already set)
- `headers` (merged on top of endpoint headers)
- `map(data)` (overrides endpoint `map`)
- `middlewares` (call-level)
- `signal` for cancellation

`service.request(endpoint, input)` exposes the same machinery without a name lookup.

Middleware composition order from outermost to innermost:

1. `QueryClient.use(...)` middlewares
2. service `middlewares`
3. endpoint `middlewares`
4. input `middlewares`
5. the core fetch

The core throws an `Error` with `status` and `data` attached on non-2xx responses; the body is parsed by `Content-Type` (`application/json` → JSON, else text).

## Design implication

This module is not a hook wrapper over fetch. It is a reactive cache object model with an HTTP service builder layered on top.
