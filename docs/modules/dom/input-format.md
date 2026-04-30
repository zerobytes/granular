# input-format.js

## Purpose

This file implements value formatting for `input` elements.

## Exports

- `normalizeInputFormat(format)` — coerces the raw `format` prop into a config object (or `null`)
- `applyInputFormat(value, format)` — runs the configured formatter against a value

## Supported format forms

`normalizeInputFormat` accepts:

- a string → `{ pattern, mode: 'both' }`
- a function → `{ format, mode: 'both' }`
- an object → spread over `{ mode: 'both', ... }`; recognized keys are `pattern`, `regex`, `format`, `mode`
- `null` / `undefined` → `null` (no formatting)

## Returned shape

`applyInputFormat()` always returns:

- `value` — canonical formatted value
- `visual` — what the input should display
- `raw` — unformatted characters (useful for state write-back)

When no format applies, all three are the input string. A custom `format` function may return a string (used for all three) or a `{ value, visual, raw }` object (missing fields fall back to each other).

## Modes

- `both` — visual goes to the DOM, formatted value goes to state
- `value-only` — DOM gets `raw`, state gets the formatted value
- `visual-only` — DOM gets `visual`, state gets `raw`

These modes let `ElementNode` decide what the DOM input shows and what gets written back to reactive state.

## Pattern system

Built-in tokens:

- `d` digit (`[0-9]`)
- `a` letter (`[A-Za-z]`)
- `*` alphanumeric (`[A-Za-z0-9]`)
- `s` non-alphanumeric (`[^A-Za-z0-9]`)

Non-token characters in the pattern are treated as separators inserted between consumed values. Separators only appear once at least one value character has matched.

## Design implication

Formatting is part of the core DOM binding model, not a separate forms-only plugin.

