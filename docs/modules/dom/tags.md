# tags.js

## Purpose

This module turns HTML tag names into JS factory functions like `Div`, `Span`, `Input`, and `Button`.

## Factory behavior

Each tag factory accepts any number of arguments and splits them into:

- props objects
- children

An argument counts as props only if it is a plain object and not:

- an array
- a renderable
- a DOM node
- an observable array
- a signal
- a state or state path
- a computed value

Everything else becomes child content.

## Important consequence

Tags do not need spreaded arrays to render children. If an array is passed as a child, `ElementNode` handles it.

## Exports

- `Elements` — frozen object mapping factory name → factory, covering the static tag list
- named exports for all HTML tags

## Naming and global collisions

Factory names are the tag with its first letter uppercased (`div` → `Div`). When that name already exists on `globalThis`, the prefix `Html` is added — for example, `object` becomes `HtmlObject` because `Object` is a global.

## Design implication

The tag layer is intentionally thin. The real behavior lives in `ElementNode`.

