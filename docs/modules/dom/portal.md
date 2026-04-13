# portal.js

## Purpose

`portal()` mounts content into another DOM target.

## Call forms

- `portal(content)` uses `document.body`
- `portal(target, content)` uses the given selector or node

## Runtime behavior

- content is resolved once on mount
- normalized values are mounted into the target element
- `unmount()` delegates to `Renderer.unmount()` for mounted renderables

## SSR behavior

`renderToString()` simply renders the content inline.

That means portal destination is a client-only mounting concern in the current implementation.

## Design implication

Portal keeps DOM placement separate from logical ownership, but it does not introduce a parallel component tree abstraction.

