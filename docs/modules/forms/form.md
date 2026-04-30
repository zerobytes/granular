# form.js

## Purpose

`form(initial)` builds a small reactive form state bundle.

## Returned fields

- `values` - reactive state, cloned from `initial`
- `meta` - reactive state, starts empty
- `errors` - reactive state, starts empty
- `touched` - reactive state, starts empty
- `dirty` - reactive state, boolean
- `validators` - mutable `Set`; add validator functions with `.add(fn)`
- `reset()`

## Validation model

Validators are stored in a `Set`. Each validator receives the current `values` snapshot.

On `values` change:

- dirty state is recomputed against the cloned initial snapshot via deep equality
- if `validators.size > 0`, all validators run synchronously
- sync and async validators are supported; promise results are merged after resolution
- a per-run `runId` guards stale async results, so older runs cannot overwrite a newer `errors` snapshot

## Validator results

Validators may return (or thenable-resolve to):

- `true`, `null`, or `undefined` → no error
- `false` → form-level failure as `errors._form = true`
- `string` → form-level message as `errors._form = '<string>'`
- `object` → merged key-by-key into `errors`

A validator that throws is treated as `mergeErrors(nextErrors, err.message || true)`, i.e. a form-level error.

## reset()

`reset()` restores:

- `values` to a fresh clone of the initial snapshot
- `touched`, `errors`, `meta` to empty objects
- `dirty` to `false`

## Design implication

The current form module is intentionally compact. It is a reactive bundle for form state, not a schema DSL or field registration framework.
