# resolve.js

## Purpose

`resolve()` is the minimal "unwrap if reactive" helper.

## Behavior

- signals resolve through `readSignal`
- states and state paths resolve through `readState`
- everything else is returned unchanged

## What it does not do

- it does not recurse
- it does not subscribe
- it does not special-case arrays or objects

## Design implication

`resolve()` is a local convenience for event handlers and utility logic, not a derived-state mechanism.

