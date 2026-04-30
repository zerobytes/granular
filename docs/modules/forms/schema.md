# schema.js

## Purpose

`formSchema(schema, options?)` builds a reactive form on top of [`form()`](./form.md) using a
declarative, path-keyed schema. It adds field accessors, computed validity, and a submit
handler around the same `values`/`errors`/`touched`/`dirty`/`meta` bundle returned by `form()`.

## Public surface

Re-exported from `src/index.js` as `formSchema`.

The returned object spreads the full `form()` bundle and adds:

- `field(path)` → `{ value, error, touched, setValue, setTouched, valid }`
- `errorMessage(path)` → computed `string | null`
- `valid` — computed boolean, true when `errors` is empty
- `validate()` — runs the schema validator synchronously and writes to `errors`
- `touchAll()` — marks every schema path as touched
- `submit(handler)` → `async (event?) => { ok, errors? , result? }`
- `setValue(path, value)`, `setTouched(path, isTouched?)`

Constructor options:

- `options.initial` — overrides on top of the schema-derived initial values
- `options.validateOnMount` — runs `validate()` once during construction and lets `field.error`
  / `errorMessage()` surface errors before any field is touched

## Schema shape

The schema is a flat object keyed by dotted paths into the `values` snapshot:

```
{
  'email':       { initial: '', required: true, email: true,
                   messages: { required: 'Required', email: 'Bad email' } },
  'password':    { initial: '', minLength: 8 },
  'profile.age': { initial: null, min: 18 },
}
```

Each field definition can carry:

- `initial` — seeds the value at that path through `buildInitialValues`
- one or more rule keys (see below)
- `rules: { ... }` — alternative nested location for the same rule keys
- `messages: { [ruleName]: string }` — per-rule error overrides
- `validate` — function or array of functions for custom checks

Built-in rules recognized by `fieldRules` and `applyRule`:

- `required` — rejects `undefined`, `null`, empty string, empty array
- `min`, `max` — numeric bounds (skipped for non-numbers)
- `minLength`, `maxLength` — string length bounds (`null`/`undefined` pass through)
- `pattern` — `RegExp` source string; empty values pass
- `email`, `url` — built-in regex checks; empty values pass
- `oneOf` — array membership; `null`/`undefined` pass

Rules whose value is `undefined` or `false` are skipped. If no message override is provided,
`defaultMessage(rule, params)` supplies a generic English message.

## Custom validators

Per-field custom rules come from `validate`:

- single function: `(value, snapshot) => result`
- array of functions: each is registered as its own custom rule

The schema layer treats results synchronously:

- `false` → field error using `messages.custom` or the generic `'Invalid value'`
- string → field error using that string
- anything else → ok
- a thrown error becomes `err.message` (or `false` if absent)

The first failing rule for a path wins; subsequent rules for the same path are skipped.

Async / promise-returning validators are not handled at the field-rule level here — a returned
promise is neither `false` nor a string, so the schema treats it as ok. Async validation is
still available through the underlying form: `formSchema` exposes the same `validators` `Set`
from `form()`, and any extra validator added there can return a promise. See
[forms/form.md](./form.md) for the `runId`-based async resolution and the
`true | false | string | object` return convention.

## Integration with `form()`

`formSchema` calls `form(initial)` and registers a single `schemaValidator` into
`f.validators`. That validator walks `fieldRulesMap`, reads each path with `getAt`, applies the
rules, and returns an object of `{ path: message }`.

Because `form()` merges validator results through `mergeErrors`, a returned object becomes
field-keyed entries on `errors`. The schema validator never returns `true`, `false`, or a
string itself, so it never writes to the `_form` slot — that slot is reserved for additional
validators added by the caller.

## Internal model

- `buildInitialValues(schema)` produces the initial `values` snapshot by writing each `initial`
  through `setAt`, supporting nested paths.
- `setValue` / `setTouched` clone the current snapshot through `setAt` and commit via
  `valuesState.set(...)` / `touchedState.set(...)` so the underlying `state` machinery sees a
  new branch and re-runs validators.
- `field(path).error` and `errorMessage(path)` gate visibility on `touched[path]` unless
  `validateOnMount` is set, so schema errors stay quiet until the user interacts with the
  field (or until `submit()` calls `touchAll()`).
- `valid` reads the `errors` state and is true exactly when it has no own keys.

## submit()

`submit(handler)` returns an async function that:

1. calls `event.preventDefault()` if an event-like object is passed
2. runs `touchAll()` so every schema path is marked touched
3. runs `validate()` synchronously and reads the resulting `errors`
4. on failure: returns `{ ok: false, errors }` without invoking `handler`
5. on success: awaits `handler(values.get())` and returns `{ ok: true, result }`

`submit` does not catch exceptions thrown by `handler`; they propagate to the caller.

## Reset and serialization

`reset()` is inherited from `form()` and is unchanged: it restores `values`, `touched`,
`errors`, `dirty`, and `meta` to the initial snapshot captured at construction time.

There is no dedicated serialize step; the current values snapshot is just `values.get()` and is
the same object passed to `submit` handlers.

## Errors raised on misuse

`schema.js` does not throw on its own. Misuse propagates from the underlying primitives:

- direct mutation of `values` (e.g. `values.user = ...`) throws from `state` — always go through
  `setValue` or `values.set(...)`
- a field definition that is not an object is silently treated as having no rules by
  `fieldRules`
- unknown rule keys are ignored; only the keys in the `known` list are picked up

## Design implication

`formSchema` is a thin declarative layer over `form()`. It owns path-to-rule mapping,
field-scoped accessors, and a submit lifecycle, but it delegates state, dirty tracking, and the
async validator pipeline to `form()`. The schema is data, not a class — adding fields means
adding object entries, not registering them imperatively.
