# input-format.js

## Purpose

This file implements value formatting for `input` elements.

## Supported format forms

- pattern string
- regex
- formatter function
- config object with `mode`

## Returned shape

`applyInputFormat()` always returns:

- `value`
- `visual`
- `raw`

## Modes

- `both`
- `value-only`
- `visual-only`

These modes let `ElementNode` decide what the DOM input shows and what gets written back to reactive state.

## Pattern system

Built-in tokens:

- `d` digit
- `a` letter
- `*` alphanumeric
- `s` symbol

## Design implication

Formatting is part of the core DOM binding model, not a separate forms-only plugin.

