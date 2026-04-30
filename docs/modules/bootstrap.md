# bootstrap.js

## Purpose

`bootstrap(ComponentClass, target)` is the runtime entry that mounts a function component, class-like object, or renderable tree into a target element.

The function is async and returns a `Promise`.

## Behavior

- resolves a selector string or direct element; throws `bootstrap target not found` when missing
- throws `bootstrap: component must be a function or class` when `ComponentClass` is not a function
- clears `el.textContent`
- tries `new ComponentClass(el)` first; constructor failures are swallowed and treated as "no instance"
- if the instance has `attach(el)`, awaits it and returns the instance
- if the instance has `mountInto(parent, beforeNode)`, mounts it as a renderable and returns the instance
- otherwise calls the function form `ComponentClass(el)` and normalizes the returned value through `Renderer`

## Returned value

- class/renderable instances are returned directly (after `attach` or `mountInto`)
- a `null`/`undefined` function root returns a no-op `{ unmount() {} }` handle
- a normalized function root returns `{ unmount() }` that unmounts every produced renderable and removes every produced DOM node

## Semantics

This is intentionally simple. There is no root reconciler, scheduler tree, or component lifecycle manager here. `bootstrap()` just creates the first mounted value and lets the reactive bindings do the rest.
