# Granular Module Notes

This directory is a source-anchored reading of the Granular core as it exists today.

It is not the public documentation rewrite yet. It is a technical base for that rewrite:

- one Markdown file per module
- focused on intent, contract, runtime behavior, and composition
- written from the code, not from inferred patterns from other frameworks

Suggested reading order:

1. [runtime.md](./runtime.md)
2. [renderable/renderable.md](./renderable/renderable.md)
3. [renderable/renderer.md](./renderable/renderer.md)
4. [reactivity/signal.md](./reactivity/signal.md)
5. [reactivity/state.md](./reactivity/state.md)
6. [reactivity/observe.md](./reactivity/observe.md)
7. [dom/tags.md](./dom/tags.md)
8. [dom/element.md](./dom/element.md)
9. [dom/list.md](./dom/list.md)
10. [router/router.md](./router/router.md)

Important reading stance:

- Granular does not revolve around component rerender.
- A render function builds bindings once; those bindings keep the DOM alive.
- `state`, `signal`, `list`, `when`, `match`, `observableArray`, `QueryClient`, and `Router` are all runtime pieces in the same direct-update model.
- `hydrate()` in the current core is a mount helper, not DOM-reuse hydration.

The files below try to make that philosophy explicit module by module.

