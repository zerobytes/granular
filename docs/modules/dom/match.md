# match.js

## Purpose

`match()` is the explicit multi-source predicate gate.

Signature:

`match(sources, predicate, renderTrue, renderFalse?)`

## Core semantics

- `sources` can be one source or an array
- each source is read explicitly
- `predicate(...values)` decides which branch is active
- branch functions receive no arguments

## Important runtime behavior

`MatchNode` subscribes only to the declared sources.

On source change:

- it recomputes the predicate
- if the predicate value did not change, it does nothing
- if the predicate flips, it unmounts the current branch and mounts the other branch

## Why that matters

The branch itself is not rerendered just because source values changed. `match()` only decides branch presence. Internal bindings inside the mounted branch remain responsible for their own updates.

## Design implication

This is the "explicit dependency" counterpart to the more flexible `when(() => ...)` style.

