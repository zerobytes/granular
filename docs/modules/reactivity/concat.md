# concat.js

## Purpose

`concat()` builds a reactive string from mixed static and reactive parts. The same file also exports the tagged-template helpers `tpl` and `cls`.

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

## tpl and cls

- `` tpl`...` `` is a tagged-template wrapper around `concat` with `separator: ''`
- `` cls`...` `` does the same and then collapses runs of whitespace and trims; if the result is reactive, the trim happens inside an `after(...).compute(...)`

## Design implication

`concat()` exists to keep common reactive string composition out of manual compute boilerplate.

