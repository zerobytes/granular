# runtime.js

## Purpose

`runtime.js` is the public surface assembler for the core. It does not implement behavior; it defines what the framework considers first-class.

## What it exports

- app entry: `bootstrap`
- reactivity: `signal`, `state`, `after`, `before`, `set`, `subscribe`, `resolve`, `computed`, `concat`, `persist`
- DOM/runtime nodes: `list`, `match`, `when`, `ErrorBoundary`, `virtualList`, `portal`
- data/platform: `QueryClient`, `WebSocketClient`, `Router`, `context`
- rendering: `Renderable`, `Renderer`, `renderToString`, `hydrate`
- tag factories: `Elements` plus all tag exports

## Why it matters

The file shows the real Granular core boundary. If something is not re-exported here, it is not part of the official runtime vocabulary even if it exists internally.

## Reading consequence

This file is the cleanest way to distinguish:

- public API
- internal helpers
- modules that exist today but are still effectively private

