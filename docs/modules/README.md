# Granular Module Notes

Source-anchored, one-page-per-module reading of the Granular core. Every file in `src/` has a sibling note here. The intent is technical reference, not a public-docs rewrite.

## How to read these notes

- One Markdown file per source module (`src/.../foo.js` → `docs/modules/.../foo.md`).
- Focused on intent, contract, runtime behavior, and composition with other modules.
- Written from the code, not by analogy with other frameworks.
- Granular does **not** revolve around component re-render. A render function builds bindings once; those bindings keep the DOM alive.
- `state`, `signal`, `list`, `when`, `match`, `observableArray`, `QueryClient`, and `Router` are runtime pieces of the same direct-update model.
- `hydrate()` in the current core is a mount helper, not DOM-reuse hydration.

## Suggested reading order

1. [runtime.md](./runtime.md) — surface re-exported by `src/index.js`
2. [bootstrap.md](./bootstrap.md) — entry point and root mount
3. [renderable/renderable.md](./renderable/renderable.md)
4. [renderable/renderer.md](./renderable/renderer.md)
5. [reactivity/signal.md](./reactivity/signal.md)
6. [reactivity/state.md](./reactivity/state.md)
7. [reactivity/observe.md](./reactivity/observe.md) — `after` / `before` / `compute`
8. [reactivity/computed.md](./reactivity/computed.md)
9. [reactivity/scheduler.md](./reactivity/scheduler.md) and [reactivity/dirty-host.md](./reactivity/dirty-host.md)
10. [dom/tags.md](./dom/tags.md)
11. [dom/element.md](./dom/element.md)
12. [dom/list.md](./dom/list.md), [dom/when.md](./dom/when.md), [dom/match.md](./dom/match.md)
13. [router/router.md](./router/router.md)

## Index

### Top level
- [runtime.md](./runtime.md)
- [bootstrap.md](./bootstrap.md)
- [context.md](./context.md)
- [dev.md](./dev.md)
- [devtools-hook.md](./devtools-hook.md)

### Reactivity (`src/core/reactivity/`)
- [reactivity/signal.md](./reactivity/signal.md)
- [reactivity/state.md](./reactivity/state.md)
- [reactivity/observe.md](./reactivity/observe.md)
- [reactivity/computed.md](./reactivity/computed.md)
- [reactivity/concat.md](./reactivity/concat.md)
- [reactivity/helpers.md](./reactivity/helpers.md)
- [reactivity/persist.md](./reactivity/persist.md)
- [reactivity/resolve.md](./reactivity/resolve.md)
- [reactivity/tracker.md](./reactivity/tracker.md)
- [reactivity/dirty-host.md](./reactivity/dirty-host.md)
- [reactivity/scheduler.md](./reactivity/scheduler.md)
- [reactivity/after-flush.md](./reactivity/after-flush.md)
- [reactivity/profiler.md](./reactivity/profiler.md)
- [reactivity/reactive-source.md](./reactivity/reactive-source.md)
- [reactivity/dev-hooks.md](./reactivity/dev-hooks.md)

### DOM (`src/core/dom/`)
- [dom/tags.md](./dom/tags.md)
- [dom/element.md](./dom/element.md)
- [dom/dom.md](./dom/dom.md)
- [dom/list.md](./dom/list.md)
- [dom/when.md](./dom/when.md)
- [dom/match.md](./dom/match.md)
- [dom/portal.md](./dom/portal.md)
- [dom/virtual-list.md](./dom/virtual-list.md)
- [dom/error-boundary.md](./dom/error-boundary.md)
- [dom/input-format.md](./dom/input-format.md)

### Renderables (`src/core/renderable/`)
- [renderable/renderable.md](./renderable/renderable.md)
- [renderable/renderer.md](./renderable/renderer.md)
- [renderable/render-string.md](./renderable/render-string.md)

### Forms (`src/core/forms/`)
- [forms/form.md](./forms/form.md)
- [forms/schema.md](./forms/schema.md)

### Collections, events, network (`src/core/`)
- [collections/observable-array.md](./collections/observable-array.md)
- [events/event-hub.md](./events/event-hub.md)
- [network/websocket.md](./network/websocket.md)

### Routing & data (`src/core/`)
- [router/router.md](./router/router.md)
- [query/query-client.md](./query/query-client.md)

### Internal
- [internal/symbols.md](./internal/symbols.md)
