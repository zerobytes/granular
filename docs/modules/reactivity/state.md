# state.js

## Purpose

`state()` is Granular's main application state primitive. It keeps the ergonomics of path access while preserving explicit write control.

## Internal model

`state()` is built on top of a root `signal()`. The file adds:

- path proxies
- path-aware reads and writes
- path subscription routing through a trie
- setter proxies such as `s.set().user.name = 'x'`
- optimistic mutation with rollback
- optional default fallback resolution

## Read semantics

A state path is itself a state-like object.

Examples of what the proxy exposes:

- `user.name.get()`
- `user.name.set('Ana')`
- `user.set('name', 'Ana')`
- `user.set().name = 'Ana'`

Reads are path-relative. A nested proxy resolves from its own path, not from the root.

## Write semantics

- direct mutation is forbidden: `s.user = ...` throws
- writes clone only the branch being changed through `setAtPath`
- subscribers for unrelated paths do not fire
- path subscribers only receive commits where resolved `next !== prev`

## Array ergonomics

Setter proxies expose array mutators such as:

- `push`
- `pop`
- `splice`
- `sort`
- `reverse`

These mutators produce a new array snapshot and then commit through the same path-aware state machinery.

## Advanced pieces

- `createStateFromAdapter(adapter)` lets other modules expose a state-like object without using a normal root state
- `mutateAdapter()` implements optimistic update plus rollback
- `withDefaults()` overlays fallback values on missing paths through adapter-level resolution

## Design implication

`state` is not a mutable proxy store in the Vue sense and not an immutable reducer store in the Redux sense. It is a path-addressable reactive façade over explicit immutable commits.

