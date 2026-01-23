# Granular Framework (WIP)

Granular is a JS-first frontend framework built for performance, clarity, and real control.
No template DSL, no VDOM, no magic compile step — just explicit reactivity and direct DOM updates.

If your UI should be fast **and** your code should still look like code, this is for you.

<img width="1018" height="494" alt="image" src="https://github.com/user-attachments/assets/9080dde0-c3b8-43e4-a1b2-88c05238ea6f" />



## The Pitch

- **JS-first UI**: DOM tags are functions (`Div`, `Span`, `Button`).
- **Granular updates**: only the nodes that change update.
- **Explicit reactivity**: `signal`, `state`, `after`, `before`, `set`, `compute`, `persist`.
- **No JSX/TSX**: no parallel language, no VDOM tree.
- **No build required**: runs directly in the browser (ESM).
- **No dependency pile-up**: no 300‑package dependency tree just to render a button.

## A Tiny Example

```js
const App = () => {
  const counter = persist(state(0), { key: 'counter' });

  before(counter).change((next) => {
    return (next <= 10)
  })

  after(counter).change(() => {
    console.log('counter changed')
  });

  const doubled = after(counter).compute((value) => value * 2);

  return Div(
    { style: { fontSize: 20 } },
    Span(counter),
    Span(' x2 = '),
    Span(doubled),
    Button({ onClick: () => counter.set(counter.get() + 1) }, 'Increment')
  );
};
```

## Why Granular (not React)

- **No virtual DOM**: no reconciler, no tree diff, no “render” ceremony.
- **No build tax**: skip the compile pipeline and ship ESM directly.
- **Real performance**: update only what changed, not an entire tree.
- **Explicit, readable reactivity**: `after(...targets)` and `after(...targets).compute(...)`.
- **Fewer moving pieces**: no metaframework, no plugin circus, no “install 738 packages”.
- **Functional ergonomics**: clean JS with predictable behavior (and no hook rules).

Yes, we are poking the bear — but for a reason. Complexity and over‑abstraction are not features.

## What’s in the Box

- **Core runtime**: DOM tags, renderables, granular updates.
- **State**: `state()` + computed values + persistence.
- **Query/Refetch**: caching, dedupe, retries.
- **Router**: history/hash/memory with guards and transitions.
- **Events**: `before/after` hooks everywhere (variadic).
- **SSR**: `renderToString` + `hydrate` for server HTML.
- **WebSockets**: client with reconnect + hooks.

## Reactive API (quick)

```js
const total = after(cart.items, cart.discount).compute((items, discount) => {
  return calcTotal(items, discount);
});

const unsub = after(user.name, user.role).change((next) => {
  console.log('changed:', next);
});

before(form.values).change((next) => {
  if (!next.name) return false;
});
```


## What the Framework Delivers

### JS‑First DOM Rendering
- DOM tags are functions (`Div`, `Span`, `Button`, ...).
- Props are applied directly to the real DOM.
- Children accept primitives, renderables, arrays, and observable sources.
- No HTML template parsing, no VDOM.
Granular renders **real DOM, on demand**, with zero template gymnastics. Your UI is JavaScript, nothing else.

### Renderable Contract
- `Renderable` is the base mountable unit.
- `Renderer` normalizes values:
  - primitive → `TextNode`
  - `Node` → mount directly
  - `Renderable` → mount/unmount lifecycle
  - `Array` → flattened list
This keeps rendering predictable and composable, without hidden layers.

### SSR (Server‑Side Rendering)
`renderToString(renderable)`:
- Generates HTML without a DOM.
- Works with all built‑in renderables.

`hydrate(target, renderable)`:
- Attaches UI on the client after SSR.

Example:
```js
const html = renderToString(App({ data }));
```

### DOM Utilities
- `Elements` exposes all tag functions in a single object.
- `Renderer.normalize()` accepts primitives, nodes, renderables, and arrays.

### Function Components
Plain functions:
- Components are just functions that return renderables or DOM nodes.
- One‑time construction of the view.
- Updates are granular; no re‑render loop.
- Uses `state()` and `after/before/set`.
Your component runs once. The DOM updates forever. That is the whole point.

### Signals and State
`signal(value)` and `state(value)`:
- `signal` is a small observable primitive.
- `state` provides proxy paths with `.get()` / `.set()` and read‑only bindings.
- Direct mutation of state paths is forbidden (`s.user = ...` throws).
- `mutate(optimistic, mutation, options?)` supports optimistic updates with rollback.
- `subscribe(state, selector)` returns a derived, state‑like value.
You get mutable ergonomics with immutable safety. No spread hell, no guesswork.

### Reactive Observers
`after(...targets)` / `before(...targets)`:
- Variadic targets (any change triggers).
- `change(fn)` receives `(next, prev, ctx)`.
- `compute(fn, options)` returns a read‑only, state‑like computed value.
- `before` can cancel by returning `false`.
- For arrays, `next` and `prev` are **lazy** (`next()` / `prev()`).

**change() — precise change handling**
- `next` and `prev` are values for signals/state.
- For arrays, `next`/`prev` are functions to avoid heavy snapshots.
- `ctx` includes metadata (for arrays: `ctx.patch`, `prevLength`, `nextLength`).

**compute() — derived state with intent**
- Same `next/prev/ctx` contract as `change()`.
- Supports async, debounce, hash, equality checks, and error handling.

**Array patch quick reference**
- `insert`: `{ type, index, items }`
- `remove`: `{ type, index, count, items }`
- `set`: `{ type, index, value, prev }`
- `reset`: `{ type, items, prevItems }`

**before() — control flow that no other framework has**
- Runs *before* the change is committed.
- Returning `false` cancels the change completely.
- This is not a hook. It is a guardrail.
- It lets you enforce business rules, confirm actions, block invalid state, and keep UI clean without hacks.
- Think of it as an interceptor for state: **the mutation only happens if you allow it**.

**after() — deterministic reactions**
- Runs after the change is applied.
- Great for side effects, analytics, syncing, or derived updates.
- No re-render, no virtual tree — just a direct reaction to the exact change.

### Computed / Derived State
`after(...targets).compute(fn, options)` and `before(...targets).compute(fn, options)`:
- Recomputes when any target changes.
- `fn(next, prev, ctx)` for a single target.
- `fn(nextList, prevList, ctxList)` for multiple targets.
- Supports async functions (last‑write‑wins).
- Returns a read‑only, state‑like value with `.get()` and bindings.
This is how you build reactive values without re-rendering anything.

Options:
- `debounce` delay
- `hash(...args)` skip if unchanged
- `equals(prev, next)` skip if unchanged
- `onError(err)` for sync/async errors

### Collections and Lists
`observableArray(initial)`:
- Emits patches (`insert`, `remove`, `set`, `reset`).
- Supports `before()` / `after()` hooks.

`list(items, renderItem)`:
- Efficient list rendering from observable arrays, signals, or state.

`when(condition, renderTrue, renderFalse)`:
- Reactive conditional rendering without re‑rendering parents.
Granular treats lists as live data structures, not as arrays you re‑map on every tick.

### Virtualization / Windowing
`virtualList(items, options)`:
- Optional fixed `itemSize` (measured automatically if omitted).
- Supports `direction: 'vertical' | 'horizontal'`.
- Viewport size is derived from the **parent element**.
- Only visible items are rendered (overscan supported).

Example:
```js
virtualList(rows, {
  render: (row) => Row(row),
  itemSize: 48,
  direction: 'vertical',
  overscan: 2,
});
```

Horizontal example (auto size):
```js
virtualList(cards, {
  render: (card) => Card(card),
  direction: 'horizontal',
  overscan: 3,
});
```

### State as Store
Granular does not need a separate store type. Any `state()` can be your global store.

Example (singleton module store):
```js
// user.store.js
export const userStore = state({ users: [] });

export const addUser = (user) => userStore.set().users = userStore.get().users.concat(user);
export const removeUser = (id) =>
  userStore.set().users = userStore.get().users.filter((u) => u.id !== id);
```

Selectors:
```js
const users = subscribe(userStore, (s) => s.users);
```

### Query / Refetch
`QueryClient`:
- Cache per key
- Dedupe in‑flight requests
- Retry with backoff
- `staleTime`, `cacheTime`
- `invalidate` and `refetch`
- Refetch on focus/reconnect
- Abortable fetch via `AbortController`
 - Service factory with endpoint maps and middlewares
Server state is not special. It is just state with guarantees.

Service example:
```js
const userService = queryClient.service({
  baseUrl: '/api',
  middlewares: [authMiddleware],
  endpoints: {
    getUsers: { path: '/users', method: 'GET', map: UserDTO.from },
    getUser: { path: '/users/:id', method: 'GET', map: UserDTO.from },
    createUser: { path: '/users', method: 'POST', map: UserDTO.from },
  },
});

const user = await userService.getUser({
  params: { id: 1 },
  query: { active: true },
  headers: { 'X-Trace': '1' },
});
```

### Router
`Router` / `createRouter`:
- History, hash, and memory modes
- Guards, redirects, loaders
- Transition hooks
- Scroll restoration
- Safe path matching with priorities
 - Nested routes with `children`
 - Layouts via `layout(outlet, ctx)`
- Query syncing via `router.queryParameters()`
Navigation stays declarative, but the runtime stays in your control.

Example:
```js
const AppLayout = (outlet) => Div(
  Sidebar(),
  Div({ className: 'content' }, outlet)
);

const SettingsLayout = (outlet) => Div(
  H2('Settings'),
  outlet
);

const router = createRouter({
  mode: 'history',
  routes: [
    {
      path: '/',
      layout: AppLayout,
      children: [
        { path: '', page: Home },
        { path: 'dashboard', page: Dashboard },
        {
          path: 'settings',
          layout: SettingsLayout,
          children: [
            { path: '', page: SettingsHome },
            { path: 'profile', page: Profile },
            { path: 'billing', page: Billing },
          ],
        },
      ],
    },
  ],
});
```

Query parameters:
```js
const q = router.queryParameters({ replace: false, preserveHash: true });

Input({
  value: q.term,
  onInput: (ev) => q.set().term = ev.target.value,
});

Button({ onClick: () => q.set().page = 1 }, 'Reset page');
```

### Events
`EventHub`:
- Fluent `before()` / `after()` hooks
- Dynamic event names via Proxy
One event system, used everywhere. Predictable and powerful.

### Persistence / Hydration
`persist(state, options)`:
- Returns the same target for chaining.
- Hydrates first, then subscribes and saves.
- Default serializer drops functions/symbols.
- `reconcile(snapshot)` can rebuild non‑serializable fields.
Your app survives refreshes without manual glue code.

Example:
```js
const profile = persist(state({ name: 'Ana', format: (v) => v.toUpperCase() }), {
  key: 'profile',
  reconcile: (snap) => ({ ...snap, format: (v) => v.toUpperCase() }),
});
```

### Form Management
`form(initial)` returns:
- `values`, `meta`, `errors`, `touched`, `dirty` (state‑like)
- `validators` (Set with `add/delete/clear`)
- `reset()` restores initial snapshot

Validators contract:
- `fn(values)` returns `true | false | string | object | Promise<...>`
- `true/undefined` → ok
- `false` → form error (`_form = true`)
- `string` → form error message
- `object` → field errors merged by key
Forms stop being a framework within the framework. This is just state, done right.

### Optimistic Updates
`state.mutate(optimistic, mutation, options?)`:
- Applies the optimistic change immediately.
- Rolls back automatically on error.
- Optional `rollback` and `clone` for control.

Example:
```js
await userState.mutate(
  () => userState.set().name = 'Guilherme',
  () => userService.saveUser(userState.get())
);
```

### Error Boundaries
`ErrorBoundary({ fallback, onError }, child)`:
- Catches runtime errors inside a subtree.
- Renders the fallback when an error happens.
- `onError` receives the error and context.

Example:
```js
ErrorBoundary(
  { fallback: () => Div('Ops'), onError: (err) => console.error(err) },
  () => Div('OK')
);
```


### Portals / Overlays
`portal(target, content)`:
- Renders UI outside the normal DOM hierarchy.
- `target` can be a selector or a DOM element.
Portals are how you build modals, toasts and overlays without fighting layout or z‑index wars.
Portals are **renderables**: they must exist in the render tree to mount, and they unmount when removed from the tree.

Example:
```js
portal('#overlay', () => Div({ className: 'modal' }, 'Hello'));
```

Controlled usage (recommended):
```js
const open = state(false);

const App = () => Div(
  Button({ onClick: () => open.set(true) }, 'Open'),
  when(open, () =>
    portal(() => Div(
      { className: 'modal' },
      Button({ onClick: () => open.set(false) }, 'Close')
    ))
  )
);
```

### WebSockets
`createWebSocket(options)`:
- Auto‑connect with reconnect support.
- `before/after` hooks for `message` and `send`.
- Reactive state via `ws.state()`.

Example:
```js
const ws = createWebSocket({ url: 'wss://example.com' });

ws.after().message(({ data }) => {
  console.log('message', data);
});

ws.send({ type: 'ping' });
```

