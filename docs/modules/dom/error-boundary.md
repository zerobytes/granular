# error-boundary.js

## Purpose

`ErrorBoundary(options, child)` wraps a child renderable region and can swap to fallback output when rendering throws.

## Options

- `fallback` — renderable, or a function `(error) => renderable`
- `onError` — function `(error, { phase: 'render' })`

`child` itself can be a renderable or a function that returns one.

## Current coverage

The implementation catches errors thrown during:

- initial child evaluation and mount
- SSR rendering
- fallback rendering (swallowed)
- `onError` itself (swallowed)

## Runtime model

- the boundary keeps its own anchor
- it tries to render the child
- on failure, it calls `onError(error, { phase: 'render' })`
- then it renders the fallback if provided; with no fallback the region stays empty
- on SSR, falling through with no fallback returns `''`

## Important limitation

The file guards synchronous rendering of the boundary's direct child path.

It does not, by itself, become a universal async or cross-boundary runtime error system.

## Design implication

The boundary is a structural render guard, not a whole-app exception framework.

