# Granular Framework - Complete AI Guide

This guide is designed to help AI assistants understand and generate code for the Granular framework. Granular is a JS-first, fine-grained reactive frontend framework built to outperform React in real workloads.

## Table of Contents

1. [Core Philosophy](#core-philosophy)
2. [Key Differences from React](#key-differences-from-react)
3. [Project Setup](#project-setup)
4. [DOM Tags](#dom-tags)
5. [Reactivity System](#reactivity-system)
6. [Components](#components)
7. [Conditional Rendering](#conditional-rendering)
8. [Lists and Collections](#lists-and-collections)
9. [Routing](#routing)
10. [Forms](#forms)
11. [Data Fetching](#data-fetching)
12. [State Management](#state-management)
13. [UI Component Libraries](#ui-component-libraries)
14. [Common Patterns](#common-patterns)
15. [Anti-Patterns](#anti-patterns)

---

## Core Philosophy

### Fundamental Principles

1. **JS-first rendering**: DOM tags are JavaScript functions (`Div`, `Span`, `Button`), not HTML templates or JSX
2. **No VDOM**: Direct DOM manipulation with surgical updates - no reconciliation, no diffing
3. **Fine-grained reactivity**: Only affected DOM nodes update, never entire component trees
4. **No re-render**: Components execute once; the DOM updates granularly forever
5. **Explicit reactivity**: Uses `state`, `signal`, `after`, `before`, `compute` - no magic hooks
6. **No build required**: Runs directly in the browser via ESM (optional build for optimization)

### Mental Model

```
┌─────────────────────────────────────────────────────────────────┐
│  REACT                           │  GRANULAR                    │
├─────────────────────────────────────────────────────────────────┤
│  Component re-renders on change  │  Component runs ONCE         │
│  VDOM diffing                    │  Direct DOM updates          │
│  useState causes re-render       │  state() updates only bindings│
│  useEffect(fn, deps)             │  after(deps).effect(fn)      │
│  useEffect (changes only)        │  after(deps).change(fn)      │
│  useMemo for optimization        │  after().compute() for derived│
│  Implicit dependency tracking    │  Explicit reactive targets   │
│  JSX template syntax             │  Pure JavaScript functions   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Differences from React

### CRITICAL: No Component Re-Renders

In Granular, **components are just functions that execute once**. The function body runs a single time during mounting. All subsequent updates happen through the reactive system updating only the specific DOM nodes that need to change.

```javascript
// GRANULAR - Component runs ONCE
const Counter = () => {
  const count = state(0);
  
  // This console.log runs exactly ONCE, not on every state change
  console.log('Component mounted');
  
  return Div(
    Span(count), // This Span's text updates reactively
    Button({ onClick: () => count.set(count.get() + 1) }, 'Increment')
  );
};
```

### No onMount/useEffect - The Component IS the Mount

Since the component function runs once when mounted, you don't need `onMount` or `useEffect` for initialization:

```javascript
const UserProfile = ({ userId }) => {
  const user = state(null);
  const loading = state(true);
  
  // This runs immediately when component mounts - IT IS the mount logic
  fetchUser(userId).then(data => {
    user.set(data);
    loading.set(false);
  });
  
  return when(loading,
    () => Div('Loading...'),
    () => Div(after(user).compute(u => u?.name))
  );
};
```

### No Cleanup Needed for Simple Cases

Since there's no re-render, you rarely need cleanup. Subscriptions created during mount live for the component's lifetime.

---

## Project Setup

### Installation

```bash
# Create new project
npm create @granularjs/app my-app
cd my-app
npm run dev

# Or add to existing project
npm install @granularjs/core @granularjs/ui
```

### Entry Point

```javascript
// main.js
import { bootstrap } from '@granularjs/core';
import { App } from './app.js';

bootstrap(App, '#app');
```

### With Router

```javascript
// main.js
import { createRouter } from '@granularjs/core';
import { HomePage } from './pages/home.page.js';
import { AboutPage } from './pages/about.page.js';

const router = createRouter({
  mode: 'history', // or 'hash', 'memory'
  routes: [
    { path: '/', page: HomePage },
    { path: '/about', page: AboutPage },
  ],
});

router.mount('#app');
```

---

## DOM Tags

### Basic Usage

All HTML tags are available as functions with PascalCase names:

```javascript
import { Div, Span, Button, Input, H1, P, A, Ul, Li, Form, Label } from '@granularjs/core';

// Basic element
Div('Hello World')

// With attributes (first object argument)
Div({ className: 'container', id: 'main' }, 'Content')

// Multiple children
Div(
  H1('Title'),
  P('Paragraph'),
  Button({ onClick: () => alert('clicked') }, 'Click me')
)
```

### Variadic Arguments

Tags accept N parameters. Each parameter can be:
- A props object (merged into element attributes)
- Content (text, elements, arrays, reactive values)

```javascript
// All of these are valid:
Div('text')
Div({ className: 'box' }, 'text')
Div({ className: 'box' }, { style: { color: 'red' } }, 'text')
Div('text1', 'text2', 'text3')
Div({ id: 'a' }, 'text', { className: 'b' }, Span('nested'))
```

### No Required Props — Drop Empty `{}` Arguments

Granular DOM tags use `splitPropsChildren(args)`: any plain object becomes props, anything else becomes a child. There is **no positional/required argument** — the props object is purely optional.

That means `Div({}, child)` (or `Card({}, child)`, `Stack({}, child)` from any UI library that follows the same convention) is pure noise. It allocates an empty object on every call, pressures GC, and adds visual clutter for zero benefit.

```javascript
// WRONG - empty props object is wasteful and noisy
Div({},
  Span({}, 'Hello'),
)

// CORRECT - just drop the empty object
Div(
  Span('Hello'),
)
```

Only pass a props object when you actually have props to set:

```javascript
Div({ className: 'box' }, Span('with class'))
Span({ style: { color: 'red' } }, 'red text')
```

### Code Style: First Argument On the Same Line

Granular code is heavily nested by nature. To keep it readable, **put the first argument on the same line as the opening parenthesis**, then put each subsequent child on its own indented line. Hugging the opening paren saves a line per call and makes the tree shape obvious.

```javascript
// PREFERRED
when(somePredicate,
  () => SomeComponent(),
  () => SomeOtherComponent(),
)

when(someOtherPredicate, () => SomeNewComponent())

Div({ className: 'card' },
  Div('Some content'),
  Div('More content',
    Span('inner 1'),
    Span('inner 2'),
    Span('inner 3'),
  ),
)

list(items, (item) =>
  Div({ className: 'row' },
    Span(item.label),
    Span(item.value),
  ),
)

// AVOID - opening with a lone paren wastes a line on every call
when(
  somePredicate,
  () => SomeComponent(),
)

Div(
  { className: 'card' },
  Div('Some content'),
)
```

Short calls that fit on one line (no children, or a single short child) should stay on one line: `Span({ className: 'lbl' }, 'label')`, `Br()`, `Hr()`.

### Reactive Attributes

All attributes automatically accept reactive values (state, signal, computed):

```javascript
const color = state('red');
const visible = state(true);

Div({
  style: { 
    color: color,  // Automatically updates when color changes
    display: after(visible).compute(v => v ? 'block' : 'none')
  },
  className: after(color).compute(c => `text-${c}`)
}, 'Reactive styles!')
```

### Event Handlers

Use standard DOM event names with `on` prefix:

```javascript
Button({
  onClick: (e) => console.log('clicked', e),
  onMouseEnter: () => console.log('hover'),
  onKeyDown: (e) => e.key === 'Enter' && submit(),
}, 'Click me')

Input({
  onInput: (e) => name.set(e.target.value),
  onChange: (e) => validate(e.target.value),
  onFocus: () => setFocused(true),
  onBlur: () => setFocused(false),
})
```

### Capturing DOM References

Use the `node` prop to capture the underlying DOM element:

```javascript
const inputEl = state(null);

Input({
  node: inputEl,  // Populated when element mounts
  type: 'text'
});

// Later: inputEl.get().focus()
```

---

## Reactivity System

### State

`state(initialValue)` creates a reactive container. Both `.get()` and `.set()` are **path-relative**: calling them from a nested path resolves from that path, not the root.

```javascript
import { state } from '@granularjs/core';

const count = state(0);

// Read
count.get()  // 0

// Write
count.set(1)

// Write with setter proxy (for nested updates)
const user = state({ name: 'Ana', age: 25 });
user.set().name = 'Maria';  // Updates name without replacing entire object
user.set('age', 30);        // Alternative syntax

// Path access
user.name  // Returns a reactive path, not the value!
user.name.get()  // Returns 'Maria' (path-relative)
user.get()       // Returns { name: 'Maria', age: 30 } (root)

// Path-relative .set()
user.name.set('Ana')  // Sets name to 'Ana' (path-relative)
```

### Signal

`signal(value)` is a simpler observable primitive:

```javascript
import { signal, readSignal, setSignal } from '@granularjs/core';

const count = signal(0);
readSignal(count)  // 0
setSignal(count, 1)
```

### Observing Changes with after()

`after(...targets)` observes one or more reactive targets:

```javascript
import { after, state } from '@granularjs/core';

const name = state('');
const age = state(0);

// React to changes
after(name).change((next, prev) => {
  console.log(`Name changed from ${prev} to ${next}`);
});

// Multiple targets
after(name, age).change(([nextName, nextAge], [prevName, prevAge]) => {
  console.log('Name or age changed');
});

// The change() method returns an unsubscribe function
const unsub = after(name).change(() => {});
unsub(); // Stop listening
```

### Run-On-Mount + On-Change with effect()

`after(...targets).effect(fn)` runs `fn` once with the current target
values **and** on every subsequent change. This is the direct analog of
React's `useEffect(fn, [deps])` — useful when an effect needs to sync the
DOM (or any external system) with the initial state, not just react to
later updates.

```javascript
import { after, state } from '@granularjs/core';

const mode = state('dark');

// Sync `data-theme` immediately AND whenever `mode` changes.
after(mode).effect((current) => {
  document.documentElement.setAttribute('data-theme', current);
});
// → on construction: setAttribute('data-theme', 'dark')
// → after `mode.set('light')`: setAttribute('data-theme', 'light')

// Multiple targets:
after(width, height).effect(([w, h]) => {
  canvas.resize(w, h);
});
```

`.effect(fn)` returns the same unsubscribe function as `.change(fn)`.

Pick the right verb:

- `.change(fn)` — reacts only to **changes**. Use when the initial value
  is irrelevant (e.g. logging, analytics, persisting future writes).
- `.effect(fn)` — runs **once now + on changes**. Use when the side
  effect must keep an external surface (DOM attributes, native APIs,
  storage) in sync with the reactive state from the very first render.
- `.compute(fn)` — produces a **derived reactive value**. Use when you
  want a new state object the rest of the tree can subscribe to.

### Computing Derived Values

`after(...targets).compute(fn)` creates a read-only reactive value:

```javascript
const firstName = state('John');
const lastName = state('Doe');

// Single target
const upperName = after(firstName).compute(name => name.toUpperCase());

// Multiple targets
const fullName = after(firstName, lastName).compute(
  ([first, last]) => `${first} ${last}`
);

// Use computed values anywhere you'd use state
Div(fullName)  // Automatically updates

// Computed values are read-only
fullName.get()  // 'John Doe'
// fullName.set() - ERROR: Cannot set computed values
```

### Compute Options

```javascript
const searchResults = after(searchQuery).compute(
  async (query) => {
    const response = await fetch(`/api/search?q=${query}`);
    return response.json();
  },
  {
    debounce: 300,  // Wait 300ms after last change
    hash: (query) => query.trim().toLowerCase(),  // Skip if hash unchanged
    equals: (prev, next) => JSON.stringify(prev) === JSON.stringify(next),
    onError: (err) => console.error('Search failed:', err),
  }
);
```

### Blocking Changes with before()

`before(...targets).change(fn)` runs BEFORE a change is applied. Return `false` to cancel:

```javascript
const age = state(18);

// Validation - block invalid values
before(age).change((next, prev) => {
  if (next < 0) return false;  // Cancel the update
  if (next > 150) return false;
  return true;  // Allow the update
});

age.set(-5);  // Blocked! age remains 18
age.set(25);  // Allowed
```

### Persistence

`persist(state, options)` saves state to localStorage:

```javascript
import { persist, state } from '@granularjs/core';

const theme = persist(state('light'), { key: 'app-theme' });

// Value is automatically saved and restored
theme.set('dark');  // Saved to localStorage
// On page reload, theme starts with 'dark'
```

### Observable Arrays

For fine-grained array updates:

```javascript
import { observableArray } from '@granularjs/core';

const items = observableArray([1, 2, 3]);

// Mutations emit patches (insert, remove, set, reset)
items.push(4);    // Patch: { type: 'insert', index: 3, items: [4] }
items.splice(1, 1); // Patch: { type: 'remove', index: 1, count: 1 }

// Subscribe to changes
items.subscribe((patch) => {
  console.log('Array changed:', patch);
});

// Works with list() for efficient rendering
```

---

## Components

### Function Components

Components are plain functions returning renderables:

```javascript
// Simple component
const Greeting = ({ name }) => Div(`Hello, ${name}!`);

// With state
const Counter = () => {
  const count = state(0);
  
  return Div(
    Span('Count: ', count),
    Button({ onClick: () => count.set(count.get() + 1) }, '+')
  );
};

// Usage
Div(
  Greeting({ name: 'World' }),
  Counter()
)
```

### Component with Reactive Props

Props are static (no re-render), but you can pass reactive values:

```javascript
const Display = ({ value }) => {
  // If value is a state/signal, it's reactive
  return Div(value);
};

const App = () => {
  const count = state(0);
  
  return Div(
    Display({ value: count }),  // Passes the reactive state
    Button({ onClick: () => count.set(count.get() + 1) }, '+')
  );
};
```

### Composing Components

```javascript
const Card = ({ title, children }) => 
  Div({ className: 'card' },
    Div({ className: 'card-header' }, title),
    Div({ className: 'card-body' }, children)
  );

const UserCard = ({ user }) =>
  Card({
    title: user.name,
    children: Div(
      P('Email: ', user.email),
      P('Role: ', user.role)
    )
  });

// Usage
UserCard({ user: { name: 'Ana', email: 'ana@example.com', role: 'Admin' } })
```

---

## Conditional Rendering

### Using when()

`when(condition, renderTrue, renderFalse)` for reactive conditionals:

```javascript
import { when, state } from '@granularjs/core';

const loggedIn = state(false);

// Basic conditional
when(loggedIn,
  () => Div('Welcome back!'),
  () => Div('Please log in')
)

// Nested conditionals
const role = state('user');

when(loggedIn,
  () => when(
    after(role).compute(r => r === 'admin'),
    () => Div('Admin Dashboard'),
    () => Div('User Dashboard')
  ),
  () => Div('Login Page')
)
```

### Using after().compute() for Inline Conditionals

```javascript
const status = state('loading');

Div(
  after(status).compute(s => {
    switch(s) {
      case 'loading': return Span('Loading...');
      case 'error': return Span('Error occurred');
      case 'success': return Span('Done!');
      default: return null;
    }
  })
)
```

### IMPORTANT: Always Use Arrow Functions in when()

```javascript
// CORRECT - arrow functions defer rendering
when(condition,
  () => HeavyComponent(),
  () => null
)

// WRONG - components execute immediately regardless of condition
when(condition,
  HeavyComponent(),  // Executes even if condition is false!
  null
)
```

The same rule applies to `match(sources, predicate, renderTrue, renderFalse?)` — the predicate and both branches must be functions.

### Don't Wrap Whole Subtrees in `after().compute()`

`after(x).compute(value => Tree(...))` rebuilds and remounts the entire returned subtree every time `x` changes. That defeats Granular's fine-grained reactivity — sibling text changes can re-mount whole cards.

Use `compute()` only for:
- a single derived primitive (string, number, class name, style value),
- a small leaf node whose props depend on the value,
- selecting between a few alternative components (real branch swap).

For everything else, walk into the value with **state paths**, **`when()`**, and **`list()`** so that each leaf binds itself.

```javascript
// WRONG - any change to `incident` rebuilds the entire impact subtree
const ImpactReadOnly = ({ incident }) =>
  after(incident).compute((inc) => {
    if (!inc?.impact) return null;
    return Div(
      Div(Span(inc.impact.description)),
      Div(Span(`Users: ${inc.impact.usersAffected}`)),
      ...inc.impact.platforms.map((p) => Span(p)),
    );
  });

// CORRECT - render the structure once; let leaves bind themselves
const ImpactReadOnly = ({ incident }) =>
  Div(
    Div(Span(incident.impact.description)),
    Div(
      after(incident.impact.usersAffected).compute((n) =>
        Span(`Users: ${(n ?? 0).toLocaleString()}`),
      ),
    ),
    list(incident.impact.platforms, (p) =>
      Span(after(p).compute((v) => labelMap[v] || v)),
    ),
  );
```

Why this matters:

- A leaf `Span(statePath)` updates only the text node, not its parent `<div>`.
- `list(statePath, ...)` patches inserts/removes per item — existing rows stay mounted.
- `after(leafPath).compute(fmt)` recomputes only when that leaf changes.
- `when(statePath, ...)` only swaps branches when the predicate flips truthy↔falsy.

Pull `compute()` as deep as possible toward the actual leaves that depend on the value.

### Don't Gate Whole Subtrees on Base Object Existence

`when(condition, ...)` is for **render-or-not-render** decisions. If the inner subtree should always be visible — even with empty/loading values — **don't wrap it in `when()`**. Render the structure once and let each leaf binding show empty/skeleton until data arrives.

The most common abuse is gating an entire section on a base object's existence:

```javascript
// WRONG - the whole impact card disappears until `incident.impact` becomes truthy,
// then mounts every child at once. Labels, structure, layout all flicker in.
const ImpactCard = ({ incident }) =>
  when(incident.impact, () =>
    Div({ className: 'card' },
      H3('Impact'),
      Span(incident.impact.description),
      after(incident.impact.usersAffected).compute((n) =>
        Span((n ?? 0).toLocaleString()),
      ),
      list(incident.impact.platforms, (p) => Span(p)),
    ),
  )

// CORRECT - render the Card always. Leaves bind to state paths and naturally
// show empty/0 until data loads.
const ImpactCard = ({ incident }) =>
  Div({ className: 'card' },
    H3('Impact'),
    Span(incident.impact.description),
    after(incident.impact.usersAffected).compute((n) =>
      Span((n ?? 0).toLocaleString()),
    ),
    list(incident.impact.platforms, (p) => Span(p)),
  )
```

Rule of thumb:

- The field has a **label** or **structural role** (heading, container, separator) → render it always; values can be empty temporarily.
- The element only makes sense **with a value** (an inline link icon, a stand-alone badge, a "Resolved at" timestamp with no fallback) → use `when(after(path).compute(v => !!v), ...)` or `when(statePath, ...)` to hide it.
- The field is a **list** with a section header that becomes meaningless when empty → gate with `when(after(items).compute(a => a.length > 0), ...)`.

If the structure is large and you're worried about the empty state looking bad, render a skeleton or placeholder leaf — never gate the whole subtree.

### Prefer `&&` Over `cond ? X : null`

Granular treats falsy child values (`null`, `undefined`, `false`) as "nothing" in tag children, array children, and compute return values. A ternary whose `else` branch is `null` is redundant noise — use `&&` instead.

```javascript
// WRONG - verbose ternary-to-null
Div(
  hasError ? Span(error) : null,
  count > 0 ? Span(`${count} items`) : null,
)

// CORRECT - short-circuit && (Granular drops falsy children)
Div(
  hasError && Span(error),
  count > 0 && Span(`${count} items`),
)
```

This also works inside `after().compute()` callbacks and plain `.map()` bodies:

```javascript
after(error).compute((e) => e && Span(e))

items.map((it) => it.active && Span(it.label))
```

For compound conditions, wrap in parens so `&&` does not steal earlier operands:

```javascript
// Good
(a || b) && Component()

// Bad - evaluates wrong
a || b && Component()
```

#### When NOT to use `&&`

1. `else` branch is not `null` — keep the ternary or rewrite with an early return:
   ```javascript
   flag ? Success() : Failure()
   ```

2. The condition is a **reactive `state`/`signal`/`StatePath`**, not a plain JS value. State paths are always truthy objects, so `statePath && X()` always returns `X()`. Use `when()`:
   ```javascript
   // WRONG - statePath is always truthy
   incident.description && Span(incident.description)

   // CORRECT - reactive gate
   when(incident.description, () => Span(incident.description))
   ```

   Rule of thumb: inside `after().compute(val => ...)` and `.map()` callbacks you hold a plain unwrapped value → use `&&`. Outside those callbacks, with a `StatePath`/`signal`/`state` source → use `when()`.

3. Returning non-DOM data (business values a caller inspects), keep the ternary:
   ```javascript
   const last = after(list).compute((items) => items.length ? items[items.length - 1] : null);
   ```

---

## Lists and Collections

### Using list()

`list(items, renderItem)` renders arrays with fine-grained reactivity. Each item is wrapped in `state(item)` and each index in `signal(index)`, so the render function receives **reactive wrappers**, not raw values.

```javascript
import { list, observableArray, after } from '@granularjs/core';

const todos = observableArray([
  { id: 1, text: 'Learn Granular', done: false },
  { id: 2, text: 'Build app', done: false },
]);

// renderItem receives (itemState, indexSignal) - both reactive
Ul(
  list(todos, (todo, index) => 
    Li(
      Span(index),           // index is a signal - reactive, auto-updates on insert/remove
      Span(' - '),
      Span(todo.text),       // todo.text is a StatePath - reactive binding
      Span(after(todo.done).compute(d => d ? ' ✓' : '')),
      Button({
        onClick: () => todo.set().done = !todo.done.get()  // update via state
      }, 'Toggle')
    )
  )
)

// Insert - only adds new DOM nodes, existing items untouched
todos.push({ id: 3, text: 'Deploy', done: false });

// Replace item - only the bound text nodes update, DOM structure stays intact
todos[0] = { id: 1, text: 'Master Granular', done: true };
```

### CRITICAL: renderItem receives state, not raw values

```javascript
// The render function receives:
// - item: state(rawItem)   → use item.name for reactive bindings, item.name.get() for raw value
// - index: signal(number)  → use index for reactive display, index.get() for raw number

list(items, (item, index) => {
  // REACTIVE - use state paths directly in DOM
  Span(item.name)          // updates when name changes
  Span(item.status)        // updates when status changes

  // RAW VALUE - use .get() inside event closures
  onClick: () => doSomething(item.id.get())
  onClick: (e) => handler(index.get(), e)

  // DEFAULTS - use after().compute() (StatePath is always truthy, can't use ||)
  after(item.size).compute(s => s || 'md')

  // WRONG - .get() at the top kills reactivity
  const raw = item.get();  // ❌ Static snapshot, won't react to changes
  Span(raw.name)           // ❌ Just a string, never updates
});
```

### List with State

```javascript
const items = state(['a', 'b', 'c']);

Ul(
  list(items, (item, index) => Li(item))  // item is state('a'), reactive
)

// Update entire array - full reset
items.set(['x', 'y', 'z']);
```

### Virtual List (Windowing)

For large lists, use virtualization:

```javascript
import { virtualList, observableArray } from '@granularjs/core';

const rows = observableArray(Array.from({ length: 10000 }, (_, i) => ({ id: i })));

Div({ style: { height: '400px', overflow: 'auto' } },
  virtualList(rows, {
    render: (row) => Div({ className: 'row' }, `Row ${row.id}`),
    itemSize: 48,  // Fixed height in pixels
    direction: 'vertical',
    overscan: 3,   // Extra items to render outside viewport
  })
)
```

---

## Routing

### Basic Router Setup

```javascript
import { createRouter } from '@granularjs/core';

// Define routes with pages
const router = createRouter({
  mode: 'history',  // 'history' | 'hash' | 'memory'
  routes: [
    { path: '/', page: HomePage },
    { path: '/users', page: UsersPage },
    { path: '/users/:id', page: UserDetailPage },
    { path: '*', page: NotFoundPage },  // Catch-all
  ],
});

// Mount router to DOM
router.mount('#app');
```

### Page Components

Pages receive context as props:

```javascript
const UserDetailPage = ({ params, query, location, router }) => {
  const userId = params.id;
  const tab = query.tab || 'profile';
  
  const user = state(null);
  
  // Fetch on mount (remember: this runs once!)
  fetchUser(userId).then(u => user.set(u));
  
  return Div(
    H1(after(user).compute(u => u?.name || 'Loading...')),
    Button({ onClick: () => router.navigate('/users') }, 'Back to list')
  );
};
```

### Layouts

Wrap pages with layouts:

```javascript
const AppLayout = (outlet) => Div(
  Header(Nav(
    A({ href: '/' }, 'Home'),
    A({ href: '/about' }, 'About')
  )),
  Main(outlet),  // Page content goes here
  Footer('© 2026')
);

const router = createRouter({
  routes: [
    {
      path: '/',
      layout: AppLayout,
      children: [
        { path: '', page: HomePage },
        { path: 'about', page: AboutPage },
        { path: 'dashboard', page: DashboardPage },
      ],
    },
  ],
});
```

### Nested Routes

```javascript
const SettingsLayout = (outlet) => Div(
  Nav(
    A({ href: '/settings/profile' }, 'Profile'),
    A({ href: '/settings/security' }, 'Security')
  ),
  outlet
);

const router = createRouter({
  routes: [
    {
      path: '/',
      layout: AppLayout,
      children: [
        { path: '', page: HomePage },
        {
          path: 'settings',
          layout: SettingsLayout,
          children: [
            { path: '', redirect: '/settings/profile' },
            { path: 'profile', page: ProfilePage },
            { path: 'security', page: SecurityPage },
          ],
        },
      ],
    },
  ],
});
```

### Navigation

```javascript
// Programmatic navigation
router.navigate('/users/123');
router.navigate({ pathname: '/search', query: { q: 'hello' } });
router.replace('/login');  // Replace current entry
router.back();
router.forward();

// Link component (example)
const Link = ({ href, children }) => 
  A({ 
    href, 
    onClick: (e) => {
      e.preventDefault();
      router.navigate(href);
    }
  }, children);
```

### Route Guards

```javascript
const authGuard = ({ router }) => {
  if (!isAuthenticated()) {
    return '/login';  // Redirect
  }
  return true;  // Allow
};

const router = createRouter({
  routes: [
    { path: '/login', page: LoginPage },
    {
      path: '/dashboard',
      page: DashboardPage,
      guards: [authGuard],  // Runs before page loads
    },
  ],
});

// Global guards
router.beforeEach(({ route }) => {
  console.log('Navigating to:', route.path);
  return true;
});
```

### Query Parameters

```javascript
// Reactive query parameters
const q = router.queryParameters({ replace: true });

// Read
q.get().search  // Current value

// Write (automatically updates URL)
q.set().search = 'hello';
q.set().page = 2;

// Use in UI
Input({
  value: after(q).compute(q => q.search || ''),
  onInput: (e) => q.set().search = e.target.value,
})
```

---

## Forms

### Basic Form

```javascript
import { Form, Input, Button, state } from '@granularjs/core';

const LoginForm = () => {
  const email = state('');
  const password = state('');
  const error = state(null);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(email.get(), password.get());
    } catch (err) {
      error.set(err.message);
    }
  };
  
  return Form({ onSubmit: handleSubmit },
    Input({
      type: 'email',
      value: email,
      onInput: (e) => email.set(e.target.value),
      placeholder: 'Email',
    }),
    Input({
      type: 'password',
      value: password,
      onInput: (e) => password.set(e.target.value),
      placeholder: 'Password',
    }),
    when(error, () => Div({ className: 'error' }, error)),
    Button({ type: 'submit' }, 'Login')
  );
};
```

### Using the form() Helper

```javascript
import { form, Form, Input } from '@granularjs/core';

const ContactForm = () => {
  const { values, errors, dirty, touched, validators, reset } = form({
    name: '',
    email: '',
    message: '',
  });
  
  // Add validators
  validators.add((vals) => {
    const errs = {};
    if (!vals.name) errs.name = 'Name is required';
    if (!vals.email.includes('@')) errs.email = 'Invalid email';
    return errs;
  });
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (Object.keys(errors.get()).length) return;
    await submitForm(values.get());
    reset();
  };
  
  return Form({ onSubmit: handleSubmit },
    Input({
      value: values.name,
      onInput: (e) => values.set().name = e.target.value,
      onBlur: () => touched.set().name = true,
    }),
    when(after(errors).compute(e => e.name), 
      () => Span({ className: 'error' }, errors.name)
    ),
    // ... more fields
    Button({ 
      type: 'submit',
      disabled: after(errors).compute(e => Object.keys(e).length > 0)
    }, 'Submit')
  );
};
```

### Input Formatting

```javascript
// Phone number formatting
Input({
  value: phone,
  format: '(ddd) ddd-dddd',  // d=digit, a=letter, *=alphanumeric
  onInput: (e) => phone.set(e.target.value),
});

// Credit card
Input({
  value: card,
  format: 'dddd dddd dddd dddd',
});

// Custom formatter
Input({
  value: amount,
  format: {
    pattern: /^\d*\.?\d{0,2}$/,
    mode: 'visual-only',  // 'both' | 'value-only' | 'visual-only'
  },
});
```

---

## Data Fetching

### Using QueryClient

```javascript
import { QueryClient } from '@granularjs/core';

const queryClient = new QueryClient();

// Define a query
const usersQuery = queryClient.query({
  key: 'users',
  fetcher: async ({ signal }) => {
    const res = await fetch('/api/users', { signal });
    return res.json();
  },
  staleTime: 30000,     // Consider fresh for 30s
  cacheTime: 5 * 60000, // Keep in cache for 5min
  retry: 3,             // Retry 3 times on failure
});

// Use in component
const UsersList = () => {
  const queryState = usersQuery.state();
  
  return Div(
    when(after(queryState).compute(s => s.fetching),
      () => Div('Loading...'),
      () => null
    ),
    when(after(queryState).compute(s => s.error),
      () => Div('Error: ', after(queryState).compute(s => s.error?.message)),
      () => null
    ),
    list(
      after(queryState).compute(s => s.data || []),
      (user) => Div(user.name)
    )
  );
};
```

### Service Factory

```javascript
const api = queryClient.service({
  baseUrl: '/api',
  middlewares: [authMiddleware],
  endpoints: {
    getUsers: { path: '/users', method: 'GET' },
    getUser: { path: '/users/:id', method: 'GET' },
    createUser: { path: '/users', method: 'POST' },
    updateUser: { path: '/users/:id', method: 'PUT' },
    deleteUser: { path: '/users/:id', method: 'DELETE' },
  },
});

// Usage
const users = await api.getUsers();
const user = await api.getUser({ params: { id: '123' } });
await api.createUser({ body: { name: 'Ana', email: 'ana@example.com' } });
await api.updateUser({ params: { id: '123' }, body: { name: 'Maria' } });
```

### Simple Fetch Pattern

For simpler cases, just use fetch directly:

```javascript
const UserProfile = ({ userId }) => {
  const user = state(null);
  const loading = state(true);
  const error = state(null);
  
  // Runs once on mount
  fetch(`/api/users/${userId}`)
    .then(res => res.json())
    .then(data => user.set(data))
    .catch(err => error.set(err))
    .finally(() => loading.set(false));
  
  return Div(
    when(loading, () => Div('Loading...')),
    when(error, () => Div('Error: ', after(error).compute(e => e?.message))),
    when(user, () => Div('Name: ', after(user).compute(u => u?.name)))
  );
};
```

### Reactive Fetching

To refetch when dependencies change:

```javascript
const SearchResults = () => {
  const query = state('');
  const results = state([]);
  const loading = state(false);
  
  // Fetch when query changes (debounced)
  after(query).compute(async (q) => {
    if (q.length < 2) {
      results.set([]);
      return;
    }
    loading.set(true);
    try {
      const res = await fetch(`/api/search?q=${q}`);
      const data = await res.json();
      results.set(data);
    } finally {
      loading.set(false);
    }
  }, { debounce: 300 });
  
  return Div(
    Input({
      value: query,
      onInput: (e) => query.set(e.target.value),
      placeholder: 'Search...',
    }),
    when(loading, () => Div('Searching...')),
    Ul(list(results, (item) => Li(item.title)))
  );
};
```

---

## State Management

### Local State

Use `state()` for component-local state:

```javascript
const Counter = () => {
  const count = state(0);  // Local to this component
  return Button({ onClick: () => count.set(count.get() + 1) }, count);
};
```

### Shared/Global State

Export state from a module for global access:

```javascript
// stores/user.store.js
import { state, after } from '@granularjs/core';

export const userStore = state({
  user: null,
  token: null,
  loading: false,
});

// Selectors (derived state)
export const isAuthenticated = after(userStore).compute(s => !!s.token);
export const userName = after(userStore).compute(s => s.user?.name);

// Actions
export const login = async (email, password) => {
  userStore.set().loading = true;
  try {
    const { user, token } = await api.login(email, password);
    userStore.set().user = user;
    userStore.set().token = token;
  } finally {
    userStore.set().loading = false;
  }
};

export const logout = () => {
  userStore.set({ user: null, token: null, loading: false });
};
```

Usage:

```javascript
// Any component can import and use
import { userStore, isAuthenticated, login } from './stores/user.store.js';

const Header = () => Div(
  when(isAuthenticated,
    () => Span('Welcome, ', after(userStore).compute(s => s.user?.name)),
    () => Button({ onClick: () => router.navigate('/login') }, 'Login')
  )
);
```

### Optimistic Updates

```javascript
const toggleTodo = async (todoId) => {
  const todo = todos.find(t => t.id === todoId);
  
  await todosState.mutate(
    // Optimistic update (runs immediately)
    () => {
      const idx = todosState.get().findIndex(t => t.id === todoId);
      todosState.set().items[idx].completed = !todo.completed;
    },
    // Actual mutation (if fails, automatically rolls back)
    () => api.toggleTodo(todoId)
  );
};
```

---

## UI Component Libraries

### Using @granular/ui

`@granular/ui` is the official component library. Components are functions that accept props objects.

```javascript
import { 
  Button, 
  TextInput, 
  Select, 
  Card, 
  Modal, 
  Table,
  // ... etc
} from '@granularjs/ui';
```

### IMPORTANT: Granular-UI Component Patterns

#### Card Component

```javascript
// Card uses title and content props, NOT children
Card({
  padding: 'lg',
  title: Title({ order: 4 }, 'Card Title'),
  content: Stack(
    { gap: 'md' },
    Text('Card content goes here'),
    Button({ variant: 'light' }, 'Action')
  ),
})
```

#### Table Component

```javascript
// Table uses headers (array of strings) and rows (array of objects)
// Row object keys must match header names
Table({
  headers: ['Name', 'Email', 'Actions'],
  rows: users.map(user => ({
    Name: Text({ weight: 'medium' }, user.name),
    Email: Text(user.email),
    Actions: Button({ size: 'xs' }, 'Edit'),
  })),
})
```

#### Menu Component

```javascript
// Menu uses content prop for dropdown, children for trigger
Menu(
  {
    position: 'left',
    content: List(
      List.Item({
        title: 'Edit',
        onClick: () => handleEdit(),
      }),
      List.Item({
        title: 'Delete',
        onClick: () => handleDelete(),
      })
    ),
  },
  Button({ variant: 'subtle' }, 'Actions')  // Trigger
)
```

#### Tabs Component

```javascript
// Tabs uses tabs prop with array of { value, label, content }
Tabs({
  tabs: [
    { 
      value: 'overview', 
      label: 'Overview', 
      content: Div('Overview content') 
    },
    { 
      value: 'settings', 
      label: 'Settings', 
      content: Div('Settings content') 
    },
  ],
})
```

#### TextInput with Events

```javascript
// TextInput uses onInput, receiving the event object
TextInput({
  label: 'Email',
  value: email,
  onInput: (e) => email.set(e.target.value),  // e.target.value!
  placeholder: 'Enter email',
})
```

#### Select with Events

```javascript
// Select onChange receives the value directly
Select({
  value: selectedStatus,
  onChange: (value) => selectedStatus.set(value),  // value directly!
  data: [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ],
})
```

#### Switch with Events

```javascript
// Switch onChange receives the event object
Switch({
  label: 'Enable notifications',
  checked: enabled,
  onChange: (e) => enabled.set(e.target.checked),  // e.target.checked!
})
```

#### Group Component

```javascript
// Group uses position prop for alignment
Group(
  { position: 'apart', gap: 'sm' },  // 'apart' | 'left' | 'center' | 'right'
  Text('Left content'),
  Button('Right button')
)
```

#### Alert Component

```javascript
// Alert uses specific color names
Alert({
  title: 'Error',
  color: 'danger',  // 'blue' | 'success' | 'danger'
  withCloseButton: true,
  onClose: () => error.set(null),
}, Text('Something went wrong'))
```

---

## Common Patterns

### Loading States

```javascript
const DataList = () => {
  const loading = state(true);
  const data = state([]);
  const error = state(null);
  
  fetch('/api/data')
    .then(res => res.json())
    .then(d => data.set(d))
    .catch(e => error.set(e))
    .finally(() => loading.set(false));
  
  return Div(
    when(loading, () => Skeleton({ height: 200 })),
    when(error, () => Alert({ color: 'danger' }, 'Failed to load')),
    when(
      after(loading, error).compute(([l, e]) => !l && !e),
      () => list(data, item => Div(item.name))
    )
  );
};
```

### Debounced Search

```javascript
const Search = () => {
  const query = state('');
  const results = after(query).compute(
    async (q) => {
      if (!q) return [];
      const res = await fetch(`/api/search?q=${q}`);
      return res.json();
    },
    { debounce: 300 }
  );
  
  return Div(
    Input({
      value: query,
      onInput: (e) => query.set(e.target.value),
    }),
    list(results, item => Div(item.title))
  );
};
```

### Pagination

```javascript
const PaginatedList = () => {
  const page = state(1);
  const pageSize = 10;
  const total = state(0);
  const items = state([]);
  
  const loadPage = async (p) => {
    const res = await fetch(`/api/items?page=${p}&limit=${pageSize}`);
    const data = await res.json();
    items.set(data.items);
    total.set(data.total);
  };
  
  // Load initial page
  loadPage(1);
  
  // React to page changes
  after(page).change(loadPage);
  
  const totalPages = after(total).compute(t => Math.ceil(t / pageSize));
  
  return Div(
    Table({
      headers: ['Name', 'Status'],
      rows: after(items).compute(list => 
        list.map(item => ({
          Name: item.name,
          Status: Badge(item.status),
        }))
      ),
    }),
    Pagination({
      total: totalPages,
      page: page,
      onChange: (p) => page.set(p),
    })
  );
};
```

### Modal Pattern

```javascript
const ItemList = () => {
  const deleteModalOpen = state(false);
  const itemToDelete = state(null);
  
  const openDeleteModal = (item) => {
    itemToDelete.set(item);
    deleteModalOpen.set(true);
  };
  
  const handleDelete = async () => {
    const item = itemToDelete.get();
    await api.deleteItem(item.id);
    deleteModalOpen.set(false);
    itemToDelete.set(null);
    refreshList();
  };
  
  return Div(
    // List items with delete button
    list(items, item => 
      Div(
        item.name,
        Button({ onClick: () => openDeleteModal(item) }, 'Delete')
      )
    ),
    
    // Delete confirmation modal
    Modal(
      {
        opened: deleteModalOpen,
        onClose: () => deleteModalOpen.set(false),
        title: 'Confirm Delete',
      },
      Stack(
        { gap: 'md' },
        Text('Are you sure you want to delete ', 
          after(itemToDelete).compute(i => i?.name || ''), '?'),
        Group(
          { position: 'right', gap: 'sm' },
          Button({ 
            variant: 'light', 
            onClick: () => deleteModalOpen.set(false) 
          }, 'Cancel'),
          Button({ onClick: handleDelete }, 'Delete')
        )
      )
    )
  );
};
```

---

## Anti-Patterns

### DON'T: Treat Components Like React

```javascript
// WRONG - expecting re-render on prop change
const Display = ({ count }) => {
  // This only runs once! count won't update
  return Div(`Count: ${count}`);
};

// CORRECT - pass reactive values
const Display = ({ count }) => {
  // count is a state, automatically updates
  return Div('Count: ', count);
};
```

### DON'T: Create State in Render Expressions

```javascript
// WRONG - creates new state every time the list resets
const items = state([1, 2, 3]);

list(items, (item) => {
  const expanded = state(false);  // Created for every item, every update!
  return Div(item);
});

// CORRECT - state should be at component level or in stable structures
const ItemWithExpand = ({ item }) => {
  const expanded = state(false);  // Created once per component
  return Div(
    Button({ onClick: () => expanded.set(!expanded.get()) }, 'Toggle'),
    when(expanded, () => Div('Details'))
  );
};
```

### DON'T: Call .get() at the Top of list() Render Functions

```javascript
// WRONG - extracts raw value once, kills all reactivity
list(items, (item) => {
  const raw = item.get();       // ❌ Static snapshot (returns the item object, but only once)
  return Div(raw.name);         // ❌ Just a string, never updates
});

// CORRECT - use state paths for reactive bindings
list(items, (item) => {
  return Div(
    Span(item.name),            // ✅ Reactive - updates when name changes
    Button({
      onClick: () => action(item.id.get())  // ✅ .get() inside closure reads at call time (returns id value)
    }, 'Act')
  );
});

// NOTE: .get() is path-relative
// item.get()      → returns the item object (not root)
// item.name.get() → returns the name string
// item.id.get()   → returns the id value

// WRONG - using || with StatePath (always truthy)
list(items, (item) => Button({ size: item.size || 'sm' }));  // ❌ Always returns StatePath

// CORRECT - use after().compute() for defaults
list(items, (item) => Button({ size: after(item.size).compute(s => s || 'sm') }));  // ✅
```

### DON'T: Use Non-Arrow Functions in when() / match()

```javascript
// WRONG - executes immediately
when(condition, HeavyComponent(), null)
match(source, predicate, HeavyComponent(), null)

// CORRECT - deferred execution
when(condition, () => HeavyComponent(), () => null)
match(source, (v) => v === 'x', () => HeavyComponent(), () => null)
```

### DON'T: Write `cond ? Component() : null` in Children

Falsy children are dropped automatically. Use `&&` for the common conditional-render case (when the condition is a plain JS value):

```javascript
// WRONG
Div(
  hasError ? Span(error) : null,
  items.length > 0 ? Pagination({ total }) : null,
)

// CORRECT
Div(
  hasError && Span(error),
  items.length > 0 && Pagination({ total }),
)
```

If the condition is a reactive `state`/`signal`/`StatePath`, use `when()` instead — `&&` always returns the right side because state objects are truthy.

### DON'T: Use `state && Component()` (StatePath is always truthy)

A reactive `state`/`signal`/`StatePath` reference is an object, so it is always truthy from JS's perspective. `statePath && X()` therefore always returns `X()` and never reactively hides anything. The same goes for `statePath ? A : B`.

```javascript
// WRONG - statePath is always truthy
const open = state(false);
Div(open && Modal())              // Modal always renders
Div(open ? Open() : Closed())     // Open() always

// CORRECT - reactive show/hide
Div(when(open, () => Modal()))
Div(when(open, () => Open(), () => Closed()))
```

### DON'T: Wrap Entire Subtrees in `after().compute()`

```javascript
// WRONG - one change to `data` rebuilds the whole tree
after(data).compute((d) =>
  Div(
    Span(d.title),
    Span(d.description),
    list(d.items, ...),
  )
)

// CORRECT - leaves bind directly, list/when handle structure
Div(
  Span(data.title),
  Span(data.description),
  list(data.items, ...),
)
```

`compute()` should produce a small derived value (string, badge color, single leaf node). Reach for state paths, `when()`, and `list()` to render structures.

### DON'T: Use `array.map(item => Tag(...))` for Reactive Arrays

`array.map(item => Tag(...))` returns a static array of nodes. When the source array changes, the entire list rebuilds — items are unmounted and remounted instead of patched in place. Use `list(array, item => Tag(...))` for fine-grained patches (insert/remove/replace per item).

The same applies inside `after(items).compute((items) => items.map(...))`: the shadowed `items` is the unwrapped value, but the *outer* `items` is still reactive — wrapping `compute()` around `.map()` is a roundabout way of saying `list()`. Use `list()` directly:

```javascript
// WRONG - rebuilds every node when items changes
after(items).compute((items) =>
  Div(...items.map((it) => Row(it)))
)

// CORRECT - patch-based updates
Div(list(items, (it) => Row(it)))
```

The only acceptable case for `.map()` over a reactive array is when **nothing inside each item needs to be reactive** (the per-row content depends only on values that never change for that row). Even then, `list()` is usually clearer.

### DON'T: Gate Whole Subtrees on a Base Object's Existence

`when()` is for things that should NOT render at all when the predicate is falsy. Wrapping a large structure (cards, layouts, labeled fields) in `when(baseObject, () => ...)` is wrong — the structure should be visible from mount, with leaves naturally showing empty/0/skeleton until data loads.

```javascript
// WRONG - the entire impact section vanishes until `incident.impact` arrives
when(incident.impact,
  () => Div(
    H3('Impact'),
    Span(incident.impact.description),
    list(incident.impact.platforms, (p) => Span(p)),
    // ...many more nodes...
  ),
)

// CORRECT - structure renders immediately, leaves bind individually
Div(
  H3('Impact'),
  Span(incident.impact.description),
  list(incident.impact.platforms, (p) => Span(p)),
)
```

Reserve `when()` for elements that have no meaningful empty state.

### DON'T: Pass an Empty Props Object `{}` as a Positional Argument

Granular tags use `splitPropsChildren(args)` — there is **no required positional argument**. Empty `{}` objects are pure noise that allocate memory and add clutter.

```javascript
// WRONG
Div({},
  Span({}, 'Hello'),
)

// CORRECT
Div(
  Span('Hello'),
)
```

Only pass a props object when it actually has props in it.

### DON'T: Open Calls With a Lone Parenthesis

Granular code is heavily nested. Putting the first argument on its own line wastes a line per call and obscures the tree shape. Hug the opening paren.

```javascript
// AVOID
Div(
  { className: 'card' },
  Span(
    { className: 'inner' },
    'A',
    'B',
  ),
)

// PREFERRED
Div({ className: 'card' },
  Span({ className: 'inner' },
    'A',
    'B',
  ),
)
```

### DON'T: Forget Arrow Functions in after().compute() for DOM

```javascript
// This works for primitive values
const doubled = after(count).compute(c => c * 2);

// For DOM elements, the compute runs once and returns the element
// The element updates internally through its own reactive bindings
```

### DON'T: Try to Return Cleanup Functions

```javascript
// WRONG - there's no cleanup mechanism like useEffect
const Component = () => {
  const cleanup = () => {/* ... */};
  
  // This won't be called!
  return cleanup;
};

// For subscriptions, store the unsub if you need to cancel
const Component = () => {
  const unsub = after(someState).change(() => {});
  
  // If you need cleanup, you'd need to manage it differently
  // e.g., storing unsub and calling it when needed
};
```

### DON'T: Mutate State Directly

```javascript
// WRONG
const user = state({ name: 'Ana' });
user.name = 'Maria';  // Throws error!

// CORRECT
user.set().name = 'Maria';
// or
user.set({ name: 'Maria' });
```

---

## Summary Cheatsheet

```javascript
// === STATE ===
const count = state(0);
count.get()           // Read (path-relative)
count.set(1)          // Write (path-relative)
count.set().prop = x  // Nested write via setter proxy
// user.name.get() → returns name value, not root
// user.name.set('x') → sets name to 'x'

// === OBSERVE ===
after(x).change((next, prev) => {})     // React to changes
after(x).compute(val => val * 2)        // Derived value
before(x).change((next) => next > 0)    // Block invalid

// === DOM ===
Div({ className: 'box' }, 'Hello')
Div(Span('a'), Span('b'), Span('c'))
Input({ value: text, onInput: e => text.set(e.target.value) })

// === CONDITIONAL ===
when(condition, () => TrueCase(), () => FalseCase())
match(sources, (...vals) => predicate, () => TrueCase(), () => FalseCase())

// === LIST ===
// renderItem receives (itemState, indexSignal) - reactive wrappers
list(items, (item, index) => Div(index, ' - ', item.name))
// item.name is a StatePath (reactive), index is a signal (reactive)
// Use .get() only in event closures: onClick: () => fn(item.id.get())
virtualList(items, { render: item => Row(item), itemSize: 48 })

// === ROUTER ===
createRouter({ mode: 'history', routes: [...] })
router.navigate('/path')
router.queryParameters()

// === FORM ===
const { values, errors, validators, reset } = form({ name: '' });

// === FETCH ===
queryClient.query({ key: 'users', fetcher: () => fetch('/api/users') })
queryClient.service({ baseUrl: '/api', endpoints: {...} })

// === PERSISTENCE ===
persist(state(value), { key: 'storage-key' })
```

---

## File Structure Recommendation

```
src/
├── main.js                 # Entry point, router setup
├── router.js               # Route definitions
├── components/             # Reusable UI components
│   ├── app-shell/
│   │   └── app-shell.js
│   └── data-table/
│       └── data-table.js
├── pages/                  # Route pages
│   ├── home/
│   │   └── home.page.js
│   └── users/
│       ├── users-list.page.js
│       └── user-form.page.js
├── stores/                 # Global state
│   ├── auth.store.js
│   └── user.store.js
├── services/               # API services
│   ├── index.js
│   └── user.service.js
└── utils/                  # Utilities
    └── format.js
```

---

This guide should enable any AI assistant to correctly generate Granular applications with proper reactivity patterns, avoiding React mental models and antipatterns.
