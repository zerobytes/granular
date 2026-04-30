# runtime.js

## Purpose

`runtime.js` is the public surface assembler for the core. It does not implement behavior; it defines what the framework considers first-class.

## What it exports

- app entry: `bootstrap`
- DOM caching knob: `setTemplateCacheSize`
- signals: `signal`, `isSignal`, `setSignal`, `readSignal`
- state: `state`, `isState`, `isStatePath`, `isComputed`
- observers: `after`, `before`, `set`, `subscribe`
- value resolution: `resolve`
- derivations: `computed`, `derive`
- comparison helpers: `equals`/`eq`, `differs`/`neq`, `like`, `unlike`, `bigger`/`gt`, `smaller`/`lt`, `atLeast`/`gte`, `atMost`/`lte`, `not`, `and`, `or`
- string composition: `concat`, `tpl`, `cls`
- persistence: `persist`
- forms: `form`, `formSchema`
- DOM/runtime nodes: `list`, `match`, `when`, `isWhen`, `ErrorBoundary`, `virtualList`, `portal`
- collections: `observableArray`
- network: `WebSocketClient`, `createWebSocket`
- rendering: `Renderable`, `Renderer`, `renderToString`, `hydrate`
- data/platform: `QueryClient`, `EventHub`
- routing: `Router`, `RouterOutlet`, `createRouter`, `router`
- context: `context`
- internals exposed for tooling: `scheduler`, `profiler`
- tag factories: `Elements` plus `export * from './dom/tags.js'`

## Why it matters

The file shows the real Granular core boundary. If something is not re-exported here, it is not part of the official runtime vocabulary even if it exists internally.

`src/index.js` re-exports everything in this file (plus `tags.js`), so the runtime module is the single source of truth for the package's public API.

## Reading consequence

This file is the cleanest way to distinguish:

- public API
- internal helpers
- modules that exist today but are still effectively private
