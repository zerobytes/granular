# virtual-list.js

## Purpose

`virtualList(items, options)` renders only the visible window of a collection.

## Supported sources

- plain arrays
- `observableArray`
- `signal`
- `state`
- `state path`

## Options

- `render(item, index)` — required; throws on mount if missing
- `direction` — `'vertical'` (default) or `'horizontal'`
- `overscan` — number of extra rows above/below the viewport, default `2`
- `itemSize` — fixed pixel size; when omitted, the first item is rendered to be measured

## Rendering model

The node creates:

- a scroll container with `overflow: auto`, `width: 100%`, `height: 100%`, `contain: layout paint`
- a spacer element sized to the total list extent
- an absolutely positioned items layer translated via `transform`

It then calculates:

- viewport size
- item size
- start index (`floor(scroll / size) - overscan`, clamped)
- end index (`start + visibleCount + overscan * 2 - 1`, clamped)
- translate offset (`start * size`)

The visible window only re-mounts when `start` or `end` actually changes.

## Measurement behavior

- if `itemSize` is given, it uses it directly
- otherwise it temporarily renders the first item and measures it on the next animation frame, then re-renders with the measured size

## Resize tracking

A `ResizeObserver` (when available) watches the parent element and triggers a re-measure plus re-render on size changes.

## Source change behavior

Any patch from an `observableArray`, signal write, or state write triggers a full `#render` pass. Patch types are not consumed individually; the visible window is recomputed from the latest snapshot.

## SSR behavior

`renderToString()` renders the full list, not a viewport subset.

## Design implication

This module optimizes client mount and scroll performance without changing the fundamental value-to-DOM rendering model.

