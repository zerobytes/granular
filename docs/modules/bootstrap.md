# bootstrap.js

## Purpose

`bootstrap()` is the runtime entry that mounts a function component, class-like object, or renderable tree into a target element.

## Behavior

- resolves a selector or direct element
- clears target content
- tries `new ComponentClass()` first
- if the result has `attach()`, it delegates there
- if the result has `mountInto()`, it mounts it as a renderable
- otherwise it calls the function form and normalizes the returned value through `Renderer`

## Semantics

This is intentionally simple. There is no root reconciler, scheduler tree, or component lifecycle manager here. `bootstrap()` just creates the first mounted value and lets the reactive bindings do the rest.

## Returned value

- class/renderable instances are returned directly
- plain function roots return a small `{ unmount() }` handle

