# concat.js

## Purpose

`concat()` builds a reactive string from mixed static and reactive parts.

## Supported parts

- plain strings or numbers
- signals, states, state paths, computed values
- nested arrays of parts
- tuples like `[source, mapper]`
- callback parts

## Tuple semantics

For `[source, mapper]`:

- if `mapper` is a function, it receives the resolved source value
- if `mapper` is a string, it behaves like a conditional class/token: truthy source yields that string, falsy source yields empty string

## Options

The last argument may be an options object with:

- `separator`
- `filterFalsy`

## Return shape

- if no reactive targets are found, `concat()` returns a plain string immediately
- if reactive targets exist, it returns a computed reactive string

## Design implication

`concat()` exists to keep common reactive string composition out of manual compute boilerplate.

