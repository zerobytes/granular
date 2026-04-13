# virtual-list.js

## Purpose

`virtualList()` renders only the visible window of a collection.

## Supported sources

- plain arrays
- `observableArray`
- `signal`
- `state`
- `state path`

## Rendering model

The node creates:

- a scroll container
- a spacer element representing full size
- an absolutely positioned items layer

It then calculates:

- viewport size
- item size
- start index
- end index
- translate offset

## Measurement behavior

- if `itemSize` is given, it uses it directly
- otherwise it temporarily renders the first item and measures it on the next animation frame

## SSR behavior

`renderToString()` renders the full list, not a viewport subset.

## Design implication

This module optimizes client mount and scroll performance without changing the fundamental value-to-DOM rendering model.

