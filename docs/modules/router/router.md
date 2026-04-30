# router.js

## Purpose

`Router` is Granular's navigation and view-switching runtime. The module also exports `RouterOutlet`, `createRouter(options)`, and a default `router` instance.

## Constructor options

- `mode` - `'history' | 'hash' | 'memory'`, default `'history'`
- `basePath` - normalized to start with `/` and have no trailing slash
- `caseSensitive` - default `false`
- `trailingSlash` - `'ignore' | 'preserve'`, default `'ignore'`
- `maxRedirects` - default `8`; throws on overflow or detected loop
- `scrollRestoration` - default `true`; scrolls to hash target or `(0, 0)`
- `transition` - default route transition shape; falls through to per-route override
- `errorPage` - default error page; falls through to per-route override
- `initialUrl` - memory mode only; default `'/'`

## Route definition

`router.add(pathOrConfig, PageClass?, options?)` accepts:

- a path string + page + options
- a page function carrying `route` or `path` metadata
- a plain config object

Accepted route fields:

- `path` (required), `name`, `meta`
- `page` - function or class; class is detected via `prototype.constructor === ctor`
- `load(ctx)` - dynamic import returning a page or `{ default: page }`
- `redirect` - string, function, or async function returning a string
- `layout(outletState, ctx)` - returns a renderable wrapping the leaf outlet
- `loader(ctx)` - per-route data loader
- `guards` - function or array of functions
- `beforeEnter` - guard alias
- `beforeLeave` - currently stored on the route but not invoked by navigation
- `props(ctx)` - extra props merged into the page
- `reuse` - default `true`; reuses the page instance on same-route navigations
- `transition` - per-route transition config
- `errorPage` - per-route error page
- `children` - nested routes; combined with parent path

A route must provide at least one of `page`, `load`, `redirect`, `layout`, or `children`, else `add()` throws.

## Path matching

Paths compile to regex with score-based ordering:

- literal segments score `3`
- `:param` and `:param?` score `2`; `?` makes the param optional
- splat `*` (or `/*`) scores `1` and matches the rest
- routes are sorted by descending score, so more specific matches win
- params are URL-decoded into the `params` object

`trailingSlash: 'preserve'` keeps the path's trailing slash in the regex; `'ignore'` allows an optional one.

## Navigation pipeline

`#runNavigation(location, ...)` does this in order:

1. `#match(pathname)` against the sorted route table; no match → `false`
2. `#resolveRedirect(chain)` runs each route's `redirect` (string / sync / async)
3. `#runGuards(chain)` runs `beforeEach`, then per-route `guards`/`beforeEnter` and `page.guards`/`page.beforeEnter`
4. `#runLoader(chain)` runs every loader and produces `{ map, leaf }` for `routeData` and `data`
5. `#resolvePage(route)` returns `route.page` or awaits `route.load(ctx)` (supports `{ default }`)
6. `#buildLayoutTree(page, ctx)` wraps the page from innermost to outermost layout, sharing one `outletState`
7. `#swapPage` either reuses the layout (and calls `outletState.set(page)`) or tears down and remounts
8. `#applyScrollRestoration(ctx)`

A `#navToken` counter is bumped on every navigation so stale async work is dropped.

## Guard semantics

A guard returning:

- `false` cancels (no redirect)
- a `string` triggers a `replace` redirect
- `{ redirect: '...' }` triggers a `replace` redirect
- a `Promise` is awaited and the result is re-handled
- otherwise navigation continues

When a guard cancels a `pop` navigation, `#restoreCurrentUrl()` rewrites the URL back to the current one.

## Imperative API

- `mount(target)` / `unmount()` - attach/detach to a DOM element
- `start()` / `stop()` - listen for `popstate` and (for hash mode) `hashchange`
- `navigate(to, options?)` - push
- `replace(to, options?)` - replace
- `back()` / `forward()` / `go(delta)` - delegates to `history` or memory stack
- `resolve(path)` - returns a full URL string (applies `basePath`)
- `parse(url)` - returns `{ location, match }`
- `current` getter - last successful navigation snapshot
- `checkGuards()` - re-runs guards against the current location
- `routeState()` - reactive state with `{ route, chain, params, query, location, page }`
- `queryParameters(options?)` - reactive bridge between location query and a state object
- `beforeEach(fn)` / `afterEach(fn)` - global hooks; return unregister functions

`navigate`/`replace` accept either a string or `{ pathname, query, hash, search }`; `state` is forwarded to `history.pushState`.

## queryParameters

`queryParameters({ replace = true, preserveHash = true })` returns a state. Writes to the state are serialized through `URLSearchParams` and pushed via `replace`/`navigate`; route changes write back into the state. The returned state has a non-enumerable `dispose()` to detach both subscriptions.

## Layouts

`layout(outletState, ctx)` is called from leaf to root; the leaf becomes the value of `outletState`. When the layout chain key (the join of `route.id` for layout-bearing ancestors) matches the current key, the next page is swapped via `outletState.set(page)` instead of remounting the layout shell.

## Page lifecycle events

When the page exposes `emitBefore` / `emitAfter`, the router emits:

- `routeEnter` on the new page after construction
- `routeLeave` on the previous page before swap
- `routeUpdate` on same-route reuse
- `routeError` after an error page is mounted

## Error handling

When `#runNavigation` throws and an `errorPage` is configured (route or router), the error page is mounted with `ctx.error`; otherwise the error is re-thrown.

## Modes

- `history`: listens to `popstate`, uses `history.pushState/replaceState` with the resolved URL
- `hash`: listens to `popstate` and `hashchange`, prefixes URLs with `#`
- `memory`: keeps a `{ stack, index }`; `back`/`forward`/`go` mutate the index; navigations slice the stack on push

## Current nuance in the implementation

The file already contains a transition helper `#applyTransition()` and propagates a `transition` value through navigation, but the current swap path does not call it. Route transition configuration is part of the router shape, but visual transitions are not active.

`beforeLeave` is read off route configs but never invoked by the navigation pipeline.

## RouterOutlet

`RouterOutlet` adapts an imperative `router.mount(parent)` call to the renderable contract. On `mountInto(parent)` it calls `router.mount(parent)`; on `unmount()` it calls `router.unmount()`. Use it when you need context providers (or any other renderable) wrapping the routing tree. `renderToString()` returns `''`.

## SSR relevance

The router is a client runtime object. SSR pages can still be rendered outside it, as shown by standalone server entry modules that directly map URLs to pages.

## Design implication

This router is not a wrapper around rerendered routes. It is a mount/swap runtime that tries to preserve the mounted view graph where route semantics allow it.
