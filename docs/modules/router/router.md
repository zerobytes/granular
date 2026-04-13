# router.js

## Purpose

`Router` is Granular's navigation and view-switching runtime.

## Supported modes

- `history`
- `hash`
- `memory`

## Route definition capabilities

Routes may provide:

- `path`
- `page`
- `load`
- `redirect`
- `layout`
- `loader`
- `guards`
- `beforeEnter`
- `beforeLeave`
- `props`
- `reuse`
- `transition`
- `errorPage`
- nested `children`

## Matching model

- route paths compile to regexes
- dynamic params and splats are supported
- matches are score-sorted
- the router also builds a route chain from parent layouts

## Navigation pipeline

At a high level, a navigation does this:

1. parse target location
2. match route
3. resolve redirects
4. run global and route guards
5. run loaders across the matched chain
6. resolve the page class or loaded module
7. build layouts around the page
8. mount or update the current route view

## Important implemented pieces

- `routeState()` exposes the current route as reactive state
- `queryParameters()` binds query string to a state object
- layouts are composed from the matched route chain
- layout reuse is based on a layout-chain key
- same-route reuse can emit `routeUpdate`
- route pages can receive `routeEnter`, `routeLeave`, `routeUpdate`, `routeError`

## Current nuance in the implementation

The file already contains a transition helper, `#applyTransition()`, but the current swap path does not call it. So route transition configuration exists in the router shape, but visual transitions are not fully active yet.

## SSR relevance

The router is a client runtime object. SSR pages can still be rendered outside it, as shown by standalone server entry modules that directly map URLs to pages.

## Design implication

This router is not a wrapper around rerendered routes. It is a mount/swap runtime that tries to preserve the mounted view graph where route semantics allow it.
