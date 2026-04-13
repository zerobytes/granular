# symbols.js

## Purpose

This file groups internal symbols used to avoid public-name collisions.

## Symbols

- `instrumentBoundProp`
- `subscribeProp`
- `noValue`

## Usage

- `DirtyHost` uses the instrumentation and subscription symbols
- `observe.js` uses `noValue` as a sentinel during multi-target capture

## Design implication

The file is tiny, but it helps keep internal protocol names out of the public surface.

