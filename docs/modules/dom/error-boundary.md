# error-boundary.js

## Purpose

`ErrorBoundary()` wraps a child renderable region and can swap to fallback output when rendering throws.

## Current coverage

The implementation catches errors thrown during:

- initial child evaluation
- SSR rendering
- fallback rendering

## Runtime model

- the boundary keeps its own anchor
- it tries to render the child
- on failure, it calls `onError(error, { phase: 'render' })`
- then it renders the fallback if provided

## Important limitation

The file guards synchronous rendering of the boundary's direct child path.

It does not, by itself, become a universal async or cross-boundary runtime error system.

## Design implication

The boundary is a structural render guard, not a whole-app exception framework.

