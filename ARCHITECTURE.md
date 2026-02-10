# Granular Architecture

This document describes the full architecture of the Granular framework as implemented in this repository. It focuses on the current runtime design, module boundaries, core flows, and how features compose without build-time tooling.

## Principles

- JS-first rendering with tag functions (no HTML templates).
- No mandatory build step; ESM runtime in the browser.
- Optional packaging step for distribution (minify + type generation only).
- Granular updates: only affected nodes update (no full re-render).
- Minimal dependencies (no local node_modules required).
- No JSX/TSX; no VDOM.
- Explicit, predictable reactivity (after/before/set).
- Performance-first architecture designed to beat React in real workloads.

## Directory Overview

- `src/core/` – runtime engine and core modules.
- `src/index.js` – public entry re-exporting the runtime.
- `types/` – generated type declarations on build.

## Core Runtime Exports

Entry point: `src/index.js`

Public exports (via `src/core/runtime.js`):
- `bootstrap`
- `component`
- `signal`, `state`, `after`, `before`, `set`, `persist`, `subscribe`
- `concat`
- `form`
- `Renderable`
- `Renderer`
- `renderToString`, `hydrate`
- `observableArray`
- `list`
- `when`
- `virtualList`
- `portal`
- `QueryClient`
- `EventHub`
- `Router`, `createRouter`, `router`
- `context`
- `ErrorBoundary`
- `Elements`
- `WebSocketClient`, `createWebSocket`

## JS Tag Rendering

Module: `src/core/dom/tags.js`

- DOM tags are functions (ex: `Div`, `Span`, `Button`).
- Props are applied directly at render time.
- `content` is the standard child payload (supports primitives, renderables, lists).

Module: `src/core/dom/element.js`

- `ElementNode` implements renderable DOM nodes.
- Uses DirtyHost bindings to update attributes and children directly.
- Lists use observable array patches for incremental updates.
- Attribute values accept `when(...)` and resolve to primitives/objects only.
- `node` prop assigns the DOM element to a reactive target (`state` or `signal`).

### Input Formatting
Module: `src/core/dom/input-format.js`

- `normalizeInputFormat` accepts a pattern string, regex, formatter function, or config object.
- `applyInputFormat` returns `{ value, visual, raw }` for display and state sync.
- `ElementNode` applies `format` on `input` elements during render and on input/change events.
- `mode` controls whether formatting affects the displayed value, the stored value, or both.

## Renderable Contract

Module: `src/core/renderable/renderable.js`

- `Renderable` is a base contract for anything mountable into the DOM.
- `Renderer` normalizes values:
  - primitive → TextNode
  - Node → Node
  - Renderable → mount/unmount
  - Array → flat list

## SSR

Module: `src/core/renderable/render-string.js`

- `renderToString(renderable)` for server HTML.
- `hydrate(target, renderable)` for client mount.

## Reactivity and Dirty Tracking

### DirtyHost
Module: `src/core/reactivity/dirty-host.js`

Core responsibilities:
- Instrument instance properties with getters/setters.
- Track dirty props and schedule microtask flushes.
- Notify bound subscribers per prop.

Event integration:
- `DirtyHost` owns an `EventHub`.
- Exposes `before()` and `after()` for fluent subscriptions.
- Emits:
  - `before().set` / `after().set` with `{ prop, prev, next }`
  - `after().flush` with `{ props }`

### AfterFlush
Module: `src/core/reactivity/after-flush.js`

- Schedules post-flush callbacks after dirty updates.

## EventHub

Module: `src/core/events/event-hub.js`

- Provides `before()` and `after()` with fluent API.
- `before` may cancel by returning `false`.
- `after` is fire-and-forget.
- Dynamic event names via Proxy:
  - `after().routeEnter(cb)`
  - `before().routeLeave(cb)`

## Collections

### observableArray
Module: `src/core/collections/observable-array.js`

Behavior:
- Wraps native array with a Proxy.
- Emits structured patches:
  - `insert`, `remove`, `set`, `reset`
- Exposes:
  - `subscribe(fn)`
  - `before()` / `after()` hooks (EventHub)

### virtualList
Module: `src/core/dom/virtual-list.js`

- Windowed list rendering (vertical or horizontal).
- Viewport measured from parent element.

### portal
Module: `src/core/dom/portal.js`

- Renders content into a different DOM target.

## WebSockets

Module: `src/core/network/websocket.js`

- `createWebSocket(options)` returns a client with `before/after` hooks.
- Reconnect support + reactive `state()`.

## Components

### Function Components
Module: `src/core/component/function-component.js`

- `component(fn)` creates a renderable function component.
- Function body is a one-time render; updates are granular.
- State is handled via `state()` and `after/before/set`.

## Reactivity

### State and Observers
Module: `src/core/reactivity/state.js` and `src/core/reactivity/observe.js`

- `state(value)` creates an observable state with `get()` and `set()`.
- `after(...x).change(fn)` and `before(...x).change(fn)` listen to changes.
- `change(fn)` receives `(next, prev, ctx)`.
- For arrays, `next`/`prev` are lazy and `ctx.patch` carries change details.
- `after(...x).compute(fn)` and `before(...x).compute(fn)` return a read‑only, state‑like computed value.
- `compute(fn, options)` supports debounce, hash, equals, onError.
- `set(x, value)` updates state or observable arrays.
- `persist(state, options)` hydrates and saves to storage.
- `concat(...parts, options)` joins primitives and reactive values into a single string.

## Stores

### State as Store
Module: `src/core/reactivity/state.js`

Granular uses `state()` as the official store primitive.
Export the singleton from a module and expose explicit functions for mutations.

## Query / Refetch Manager

### QueryClient
Module: `src/core/query/query-client.js`

Features:
- Cache per key
- Dedupe in-flight requests
- Retry with backoff
- `staleTime`, `cacheTime`
- `invalidate` and `refetch`
- Refetch on focus/reconnect
- Abortable fetch via `AbortController`
- Global middlewares (`use`)
- Service factory with endpoint maps

Query instances expose `state()` and `subscribe(...)` with selector support.

## Router

Module: `src/core/router/router.js`

Routes are defined directly in the router (no Page registry).

### Router
Module: `src/core/router/router.js`

Key features:
- Path matching with safe regex compilation.
- Prioritized matching with score.
- Guards and redirects before instantiation.
- Loader before mount.
- Supports history, hash, and memory mode.
- Transition class hooks.
- Scroll restoration to hash or top.
- Redirect loop protection.
- Nested routes with `children`.
- Layouts via `layout(outlet, ctx)`.
- Query sync via `router.queryParameters()`.

Routing flow:
1. Match path
2. Redirect (optional)
3. Guards (global + route)
4. Loader
5. Instantiate Page
6. Mount + transitions

### Reactive Guards
- `router.checkGuards()` revalidates guards for the current route.
- Returns `Promise<boolean>` indicating if all guards passed.
- Combine with `after(state).change()` to react to state changes:
  ```js
  after(authState).change(() => router.checkGuards())
  ```
- If a guard returns a redirect string, the redirect is executed automatically.
- The context receives `source: 'revalidate'` to distinguish from navigation.

Router emits route events directly on Page via `before/after`.

## Build and Packaging

### Package Metadata
`package.json`:
- Name: `granular`
- Build: `esbuild` bundle + minify + sourcemap (no transpile)
- Types: `tsc` declaration emit to `types/` (no transpile)
- Output: `dist/granular.min.js`
- Purpose: enable installation/consumption by external projects

### TypeScript Support
`tsconfig.json`:
- `allowJs` + `emitDeclarationOnly`
- Declarations generated from `src/index.js`
- Compiler is invoked via `npx -p typescript@latest tsc -p tsconfig.json`

## Security and Performance Notes

- Route matching uses generated regex from declarative patterns only.
- No direct execution of code from templates (`{prop}` is identifier only).
- Updates are targeted by binding anchors, not full re-render.
- Observable arrays update only affected list segments.
- Guards run before any Page instantiation.

## Context

Module: `src/core/context.js`

Shares reactive state across a component tree without prop drilling. Designed for Granular's "run once" component model where children construct bottom-up but mount top-down.

### API

`context(defaultValue)` returns `{ scope, state }`:
- `scope(value?)` — creates a new provider level. Returns a state-like object with `.get()`, `.set()`, path access, and `.serve(renderable)` to wrap children.
- `state()` — returns a reactive state bound to the nearest ancestor provider.

### Core Design

The context system handles two timing phases:

1. **Construction-time capture**: children construct before parents. When a child calls `ctx.state()`, a consumer is pushed to a pending queue. When the parent calls `scope.serve(renderable)`, it drains the pending queue and wraps the renderable in a `ContextProvider`.

2. **Mount-time sync**: at mount, `ContextProvider` connects each captured consumer to the provider signal. For dynamic children (e.g., inside `list()` or `when()`), a mount stack is used — consumers created during mount connect immediately to the active provider.

### Internals

- `ContextProvider` extends `Renderable`. It manages consumer connections during mount/unmount and SSR (`renderToString`).
- `createContextConsumer(defaultValue)` creates a consumer with a local signal (fallback) and an adapter that delegates to either the provider signal (when connected) or the local signal.
- `scope()` wraps the provider state in a `Proxy` that injects a `.serve()` method alongside the standard state API.

### Nesting

Multiple `scope()` calls on the same context create independent provider levels. Children resolve to the nearest ancestor provider. A scope can override its parent's value without affecting siblings at the same level.

### SSR

`ContextProvider.renderToString(render)` connects consumers and pushes to the mount stack before rendering, ensuring server-side context resolution follows the same rules as client-side.

## Current Gaps / Future Modules

Planned (not yet integrated in core):
- Devtools and time-travel logging
