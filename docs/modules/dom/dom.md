# dom.js

## Purpose

This file contains the low-level DOM marker helpers used by dynamic sections.

## Helpers

- `createComment(label, name)`
- `createAnchor(label)`
- `clearBetween(start, end, disposer?)`
- `removeNodes(nodes)`
- `nodesBetween(start, end)`

## Architectural role

Granular's dynamic sections are usually anchored by stable comment nodes. Those anchors let the runtime insert and remove content without losing its insertion point.

## Design implication

This is one of the invisible foundations of the direct-DOM model: comments are the stable boundaries for live regions.

