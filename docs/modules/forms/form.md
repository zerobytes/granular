# form.js

## Purpose

`form(initial)` builds a small reactive form state bundle.

## Returned fields

- `values`
- `meta`
- `errors`
- `touched`
- `dirty`
- `validators`
- `reset()`

## Validation model

Validators are stored in a `Set`.

On `values` change:

- dirty state is recomputed against the initial snapshot
- all validators run
- sync and async validators are supported
- later validation runs invalidate older async results through `runId`

## Error merging

Validators can return:

- `true` or `null` for no error
- `false` for generic form failure
- string for form-level message
- object for field errors

## reset()

`reset()` restores:

- values
- touched
- errors
- dirty
- meta

to the initial baseline.

## Design implication

The current form module is intentionally compact. It is a reactive bundle for form state, not a schema DSL or field registration framework.

