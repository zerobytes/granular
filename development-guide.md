# Granular Framework - Development Guide

A comprehensive, detailed guide for developers working with the Granular framework. This guide covers all features, best practices, code samples, and dos/don'ts.

## Table of Contents

1. [Introduction](#introduction)
2. [Core Concepts](#core-concepts)
3. [Project Setup](#project-setup)
4. [DOM Rendering](#dom-rendering)
5. [Reactivity System](#reactivity-system)
6. [Components](#components)
7. [Conditional Rendering](#conditional-rendering)
8. [Lists and Collections](#lists-and-collections)
9. [Routing](#routing)
10. [Forms](#forms)
11. [Data Fetching](#data-fetching)
12. [State Management](#state-management)
13. [Context](#context)
14. [Error Handling](#error-handling)
15. [Advanced Features](#advanced-features)
16. [Best Practices](#best-practices)
17. [Anti-Patterns](#anti-patterns)
18. [Performance Optimization](#performance-optimization)
19. [Testing](#testing)
20. [Deployment](#deployment)

---

## 1. Introduction

### Why Granular?

For those tired of being a markup organizer, tired of fighting against rerender mess, tired of 1GB of node_modules to make a 500kb application, layers and layers of compilation, no control over the end result of your code, Granular brings coding to the engineering level again. Code looks like code on Granular, and when you look at the code you just know what will happen. No need to figure out a one hundred steps "lifecycle".

### The Beauty of Granular Code

Granular's design philosophy is simple: **code should look like code, not templates**. Here's what that means in practice:

```javascript

const TodoApp = () => {
    const todos = observableArray([]);
    const todoItem = state({ title: '', description: '' })

    const addTodo = () => {
        todos.push(todoItem.get())
        todoItem.set({ title: '', description: '' })
    }

    return Div({ className: 'todo-list-wrapper' },
        Div({ style: { display: 'flex', alignItems: 'center' } },
            H1({ style: { flex: 1 } }, 'My Todo List'),
            Button({ onClick: addTodo }, 'Add Todo')
        ),
        Div({ className: 'container', style: { marginTop: '10px' } },
            Div({ style: { display: 'flex', gap: '10px' } },
                Input({ value: todoItem.title, placeholder: 'Title' }),
                Textarea({ value: todoItem.description, placeholder: 'Description' }),
            ),
            list(todos, TodoItem)
        )
    )
};

const TodoItem = (item) => {
    const { title, description } = item;
    const expanded = state(false)

    const toggle = () => expanded.set(!expanded.get())

    return Div({ className: 'todo-item-wrapper' },
        Div({ style: { display: 'flex', gap: '10px' }, onClick: toggle },
            H2({ flex: 1 }, title),
            Div(' - ', when(expanded, () => 'Close', () => 'Open')),
        ),
        when(expanded, () => 
          Div({ className: 'description', onClick: toggle },
            description
          )
        ),
    )
}

```

What makes this beautiful?
- **Readable**: It looks like normal JavaScript
- **Predictable**: Every part of the code has a clear purpose
- **Minimal**: No imports for hooks, no JSX, no VDOM
- **Explicit**: Reactivity is obvious (`before()`, `after()`, `compute()`)
- **Direct**: DOM manipulation is straightforward

### What is Granular?

Granular is a modern, JS-first frontend framework designed for performance, clarity, and real control. It eliminates the complexity of traditional frameworks by:

- **No VDOM**: Direct DOM manipulation with surgical updates
- **Granular updates**: Only affected nodes update (no full re-render)
- **Explicit reactivity**: Clear APIs for observing and reacting to changes
- **No build required**: Runs directly in the browser via ESM
- **JS-first**: DOM tags are JavaScript functions, not templates

### Granular vs. Traditional Frameworks

| Feature | Granular | Traditional Frameworks |
|---------|----------|-------------------------|
| Rendering | Direct DOM manipulation | Virtual DOM reconciliation |
| Reactivity | Explicit, predictable | Implicit, magical |
| Updates | Granular, targeted | Full re-renders |
| Build | Optional (ES modules) | Mandatory compilation |
| Complexity | Minimal, focused | Over-abstracted |
| Code Style | Pure JavaScript | Template DSL + JavaScript |

---

## 2. Core Concepts

### 2.1 Mental Model

Granular components are **functions that execute once** to build the initial UI. All subsequent updates happen through the reactive system, which updates only the specific DOM nodes that need to change.

```javascript
// Component runs ONCE when mounted
const Counter = () => {
  const count = state(0);
  
  console.log('Component mounted'); // Runs exactly once
  
  return Div(
    Span(count), // Updates reactively
    Button({ onClick: () => count.set(count.get() + 1) }, 'Increment')
  );
};
```

### 2.2 Key Principles

1. **JS-first UI**: DOM tags are functions (`Div`, `Span`, `Button`)
2. **Explicit reactivity**: Use `state()`, `after()`, `before()`, `compute()`
3. **Granular updates**: Only affected DOM nodes change
4. **No re-render**: Components execute once, DOM updates forever
5. **Direct DOM access**: No abstraction layers between you and the DOM

---

## 3. Project Setup

### 3.1 Installation

```bash
# Create new project with Vite
npm create @granularjs/app my-app
cd my-app
npm run dev

# Or install in existing project
npm install @granularjs/core @granularjs/ui
```

### 3.2 Basic Entry Point

```javascript
// main.js
import { bootstrap } from '@granularjs/core';
import { App } from './app.js';

bootstrap(App, '#app');
```

### 3.3 With Router

```javascript
// main.js
import { createRouter } from '@granularjs/core';
import { HomePage } from './pages/home.page.js';
import { AboutPage } from './pages/about.page.js';

const router = createRouter({
  mode: 'history', // 'history', 'hash', or 'memory'
  routes: [
    { path: '/', page: HomePage },
    { path: '/about', page: AboutPage },
  ],
});

router.mount('#app');
```

---

## 4. DOM Rendering

### 4.1 Basic Usage

All HTML tags are available as PascalCase functions:

```javascript
import { Div, Span, Button, Input, H1, P, A, Ul, Li, Form, Label } from '@granularjs/core';

// Simple element
Div('Hello World')

// With attributes
Div({ className: 'container', id: 'main' }, 'Content')

// Multiple children
Div(
  H1('Title'),
  P('Paragraph'),
  Button({ onClick: () => alert('clicked') }, 'Click me')
)
```

### 4.2 Variadic Arguments

Tags accept any number of arguments in any order:
- Props objects (merged into attributes)
- Content (text, elements, arrays, reactive values)

```javascript
Div('text')
Div({ className: 'box' }, 'text')
Div({ className: 'box' }, { style: { color: 'red' } }, 'text')
Div('text1', 'text2', 'text3')
Div({ id: 'a' }, 'text', { className: 'b' }, Span('nested'))
```

### 4.3 Reactive Attributes

All attributes automatically accept reactive values:

```javascript
const color = state('red');
const visible = state(true);

Div({
  style: { 
    color: color,  // Updates when color changes
    display: after(visible).compute(v => v ? 'block' : 'none')
  },
  className: after(color).compute(c => `text-${c}`)
}, 'Reactive styles!')
```

### 4.4 Event Handlers

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

### 4.5 DOM References

Use the `node` prop to capture DOM elements:

```javascript
const inputEl = state(null);

Input({
  node: inputEl,  // Populated when element mounts
  type: 'text'
});

// Later: inputEl.get().focus()
```

---

## 5. Reactivity System

### 5.1 State

`state(initialValue)` creates a reactive container:

```javascript
import { state } from '@granularjs/core';

const count = state(0);

// Read
count.get()  // 0

// Write
count.set(1)

// Nested updates
const user = state({ name: 'Ana', age: 25 });
user.set().name = 'Maria';  // Updates name without replacing entire object
user.set('age', 30);        // Alternative syntax

// Path access (returns reactive path)
user.name  // StatePath, not value
user.name.get()  // 'Maria'
```

### 5.2 Signal

`signal(value)` is a simpler observable primitive (low-level):

```javascript
import { signal, readSignal, setSignal } from '@granularjs/core';

const count = signal(0);
readSignal(count)  // 0
setSignal(count, 1)
```

### 5.3 Observing Changes with after()

`after(...targets)` observes reactive targets:

```javascript
import { after, state } from '@granularjs/core';

const name = state('');
const age = state(0);

// Single target
after(name).change((next, prev) => {
  console.log(`Name changed from ${prev} to ${next}`);
});

// Multiple targets
after(name, age).change(([nextName, nextAge], [prevName, prevAge]) => {
  console.log('Name or age changed');
});

// Unsubscribe
const unsub = after(name).change(() => {});
unsub();
```

### 5.4 Computing Derived Values

`after(...targets).compute(fn)` creates read-only reactive values:

```javascript
const firstName = state('John');
const lastName = state('Doe');

// Single target
const upperName = after(firstName).compute(name => name.toUpperCase());

// Multiple targets
const fullName = after(firstName, lastName).compute(
  ([first, last]) => `${first} ${last}`
);

// Use in DOM
Div(fullName)  // Automatically updates
```

### 5.5 Compute Options

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

### 5.6 Blocking Changes with before()

`before(...targets).change(fn)` runs before changes:

```javascript
const age = state(18);

before(age).change((next, prev) => {
  if (next < 0 || next > 150) return false;  // Block invalid values
  return true;  // Allow update
});

age.set(-5);  // Blocked! age remains 18
age.set(25);  // Allowed
```

### 5.7 Persistence

`persist(state, options)` saves state to localStorage:

```javascript
import { persist, state } from '@granularjs/core';

const theme = persist(state('light'), { key: 'app-theme' });

theme.set('dark');  // Saved to localStorage
// On page reload, theme starts with 'dark'
```

### 5.8 Observable Arrays

For fine-grained array updates:

```javascript
import { observableArray } from '@granularjs/core';

const items = observableArray([1, 2, 3]);

items.push(4);    // Patch: { type: 'insert', index: 3, items: [4] }
items.splice(1, 1); // Patch: { type: 'remove', index: 1, count: 1 }

items.subscribe((patch) => {
  console.log('Array changed:', patch);
});
```

---

## 6. Components

### 6.1 Function Components

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

### 6.2 Reactive Props

Props are static (no re-render), but you can pass reactive values:

```javascript
const Display = ({ value }) => Div(value);

const App = () => {
  const count = state(0);
  
  return Div(
    Display({ value: count }),  // Pass reactive state
    Button({ onClick: () => count.set(count.get() + 1) }, '+')
  );
};
```

### 6.3 Composing Components

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

## 7. Conditional Rendering

### 7.1 Using when()

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

### 7.2 IMPORTANT: Always Use Arrow Functions

```javascript
// CORRECT - arrow functions defer rendering
when(condition,
  () => HeavyComponent(),
  () => null
)

// WRONG - executes immediately regardless of condition
when(condition,
  HeavyComponent(),  // Executes even if condition is false!
  null
)
```

---

## 8. Lists and Collections

### 8.1 Using list()

`list(items, renderItem)` renders arrays with fine-grained reactivity. Each item is wrapped in `state(item)` and each index in `signal(index)`:

```javascript
import { list, observableArray, after } from '@granularjs/core';

const todos = observableArray([
  { id: 1, text: 'Learn Granular', done: false },
  { id: 2, text: 'Build app', done: false },
]);

// renderItem receives (itemState, indexSignal) - reactive wrappers
Ul(
  list(todos, (todo, index) => 
    Li(
      Span(index),           // index is a signal
      Span(' - '),
      Span(todo.text),       // todo.text is a StatePath
      Span(after(todo.done).compute(d => d ? ' ✓' : '')),
      Button({
        onClick: () => todo.set().done = !todo.done.get()
      }, 'Toggle')
    )
  )
)

// Insert - only adds new DOM nodes
todos.push({ id: 3, text: 'Deploy', done: false });

// Replace item - only bound text nodes update
todos[0] = { id: 1, text: 'Master Granular', done: true };
```

### 8.2 CRITICAL: renderItem receives state, not raw values

```javascript
list(items, (item, index) => {
  // REACTIVE - use state paths directly in DOM
  Span(item.name)          // Updates when name changes
  Span(item.status)        // Updates when status changes

  // RAW VALUE - use .get() inside event closures
  onClick: () => doSomething(item.id.get())
  onClick: (e) => handler(index.get(), e)

  // DEFAULTS - use after().compute() (StatePath is always truthy)
  after(item.size).compute(s => s || 'md')

  // WRONG - .get() at the top kills reactivity
  const raw = item.get();  // ❌ Static snapshot
  Span(raw.name)           // ❌ Never updates
});
```

### 8.3 Virtual List (Windowing)

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

## 9. Routing

### 9.1 Basic Router Setup

```javascript
import { createRouter } from '@granularjs/core';

const router = createRouter({
  mode: 'history',
  routes: [
    { path: '/', page: HomePage },
    { path: '/users', page: UsersPage },
    { path: '/users/:id', page: UserDetailPage },
    { path: '*', page: NotFoundPage },  // Catch-all
  ],
});

router.mount('#app');
```

### 9.2 Page Components

Pages receive context as props:

```javascript
const UserDetailPage = ({ params, query, location, router }) => {
  const userId = params.id;
  const tab = query.tab || 'profile';
  
  const user = state(null);
  
  fetchUser(userId).then(u => user.set(u));
  
  return Div(
    H1(after(user).compute(u => u?.name || 'Loading...')),
    Button({ onClick: () => router.navigate('/users') }, 'Back to list')
  );
};
```

### 9.3 Layouts

Wrap pages with layouts:

```javascript
const AppLayout = (outlet) => Div(
  Header(Nav(
    A({ href: '/' }, 'Home'),
    A({ href: '/about' }, 'About')
  )),
  Main(outlet),
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

### 9.4 Nested Routes

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

### 9.5 Navigation

```javascript
// Programmatic navigation
router.navigate('/users/123');
router.navigate({ pathname: '/search', query: { q: 'hello' } });
router.replace('/login');
router.back();
router.forward();

// Link component
const Link = ({ href, children }) => 
  A({ 
    href, 
    onClick: (e) => {
      e.preventDefault();
      router.navigate(href);
    }
  }, children);
```

### 9.6 Route Guards

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

### 9.7 Query Parameters

```javascript
// Reactive query parameters
const q = router.queryParameters({ replace: true });

// Read
q.get().search  // Current value

// Write (updates URL automatically)
q.set().search = 'hello';
q.set().page = 2;

// Use in UI
Input({
  value: after(q).compute(q => q.search || ''),
  onInput: (e) => q.set().search = e.target.value,
})
```

---

## 10. Forms

### 10.1 Basic Form

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

### 10.2 Using the form() Helper

```javascript
import { form, Form, Input } from '@granularjs/core';

const ContactForm = () => {
  const { values, errors, dirty, touched, validators, reset } = form({
    name: '',
    email: '',
    message: '',
  });
  
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
    Button({ 
      type: 'submit',
      disabled: after(errors).compute(e => Object.keys(e).length > 0)
    }, 'Submit')
  );
};
```

### 10.3 Input Formatting

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
    mode: 'visual-only',  // 'both', 'value-only', or 'visual-only'
  },
});
```

---

## 11. Data Fetching

### 11.1 Using QueryClient

```javascript
import { QueryClient } from '@granularjs/core';

const queryClient = new QueryClient();

const usersQuery = queryClient.query({
  key: 'users',
  fetcher: async ({ signal }) => {
    const res = await fetch('/api/users', { signal });
    return res.json();
  },
  staleTime: 30000,     // Fresh for 30s
  cacheTime: 5 * 60000, // Keep in cache for 5min
  retry: 3,             // Retry 3 times on failure
});

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

### 11.2 Service Factory

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
```

### 11.3 Simple Fetch Pattern

For simpler cases, use fetch directly:

```javascript
const UserProfile = ({ userId }) => {
  const user = state(null);
  const loading = state(true);
  const error = state(null);
  
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

### 11.4 Reactive Fetching

To refetch when dependencies change:

```javascript
const SearchResults = () => {
  const query = state('');
  const results = state([]);
  const loading = state(false);
  
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

## 12. State Management

### 12.1 Local State

Use `state()` for component-local state:

```javascript
const Counter = () => {
  const count = state(0);
  return Button({ onClick: () => count.set(count.get() + 1) }, count);
};
```

### 12.2 Shared/Global State

Export state from a module for global access:

```javascript
// stores/user.store.js
import { state, after } from '@granularjs/core';

export const userStore = state({
  user: null,
  token: null,
  loading: false,
});

// Selectors
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
import { userStore, isAuthenticated, login } from './stores/user.store.js';

const Header = () => Div(
  when(isAuthenticated,
    () => Span('Welcome, ', after(userStore).compute(s => s.user?.name)),
    () => Button({ onClick: () => router.navigate('/login') }, 'Login')
  )
);
```

### 12.3 Optimistic Updates

```javascript
const toggleTodo = async (todoId) => {
  await todosState.mutate(
    // Optimistic update (runs immediately)
    () => {
      const idx = todosState.get().findIndex(t => t.id === todoId);
      todosState.set().items[idx].completed = !todosState.get().items[idx].completed;
    },
    // Actual mutation (rolls back on error)
    () => api.toggleTodo(todoId)
  );
};
```

---

## 13. Context

### 13.1 Sharing State Without Prop Drilling

`context(defaultValue)` shares reactive state across a component tree:

```javascript
import { context, Div, Text, after } from '@granularjs/core'

const themeCtx = context('light')

const ThemeProvider = (...children) => {
  const theme = themeCtx.scope('dark')
  return theme.serve(Div(...children))
}

const ThemedCard = () => {
  const theme = themeCtx.state()
  return Div(
    { className: after(theme).compute(t => `card card-${t}`) },
    Text('Current theme: ', theme)
  )
}

// Usage
ThemeProvider(ThemedCard())
```

### 13.2 Provider Controls Its State

```javascript
const sizeCtx = context([])

const Table = (...children) => {
  const sizes = sizeCtx.scope(['1fr', '2fr', 'auto'])
  return sizes.serve(Div(...children))
}

const Row = () => {
  const sizes = sizeCtx.state()
  return Div({ 
    style: { 
      gridTemplateColumns: after(sizes).compute(s => s.join(' ')) 
    } 
  })
}
```

---

## 14. Error Handling

### 14.1 Error Boundaries

`ErrorBoundary({ fallback, onError }, child)` catches errors:

```javascript
ErrorBoundary(
  { 
    fallback: () => Div('Something went wrong'), 
    onError: (err) => console.error(err) 
  },
  () => Div('OK')
);
```

### 14.2 Try-Catch in Async Operations

```javascript
const fetchData = async () => {
  try {
    const response = await fetch('/api/data');
    const data = await response.json();
    state.set(data);
  } catch (error) {
    console.error('Fetch failed:', error);
    errorState.set(error.message);
  }
};
```

---

## 15. Advanced Features

### 15.1 Portals

Render UI outside the normal DOM hierarchy:

```javascript
const open = state(false);

const App = () => Div(
  Button({ onClick: () => open.set(true) }, 'Open Modal'),
  when(open, () =>
    portal(() => Div(
      { className: 'modal' },
      Button({ onClick: () => open.set(false) }, 'Close')
    ))
  )
);
```

### 15.2 WebSockets

```javascript
import { createWebSocket } from '@granularjs/core';

const ws = createWebSocket({ url: 'wss://example.com' });

ws.after().message(({ data }) => {
  console.log('Message:', data);
});

ws.send({ type: 'ping' });
```

### 15.3 Server-Side Rendering

```javascript
import { renderToString, hydrate } from '@granularjs/core';
import { App } from './app.js';

// Server
const html = renderToString(App({ data }));

// Client
hydrate(document.getElementById('app'), App({ data }));
```

---

## 16. Best Practices

### 16.1 File Structure

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

### 16.2 Naming Conventions

- Components: PascalCase (e.g., `UserCard`)
- State: camelCase (e.g., `userState`)
- Props: camelCase (e.g., `userName`)
- Files: kebab-case or snake_case
- Stores: `.store.js` suffix
- Pages: `.page.js` suffix

### 16.3 Performance Tips

1. **Use observableArray for dynamic lists** - Provides fine-grained updates
2. **Minimize .get() calls** - Use state paths directly in DOM for reactivity
3. **Debounce expensive operations** - Use `debounce` option in compute()
4. **Virtualize large lists** - Use virtualList() for 1000+ items
5. **Avoid unnecessary computations** - Use `hash` or `equals` options

---

## 17. Anti-Patterns

### 17.1 Treating Components Like React

```javascript
// WRONG - expecting re-render on prop change
const Display = ({ count }) => {
  return Div(`Count: ${count}`);  // Only runs once!
};

// CORRECT - pass reactive values
const Display = ({ count }) => {
  return Div('Count: ', count);  // Updates reactively
};
```

### 17.2 Creating State in Render Expressions

```javascript
// WRONG - creates new state every time list resets
list(items, (item) => {
  const expanded = state(false);  // Created for every item!
  return Div(item);
});

// CORRECT - state at component level
const ItemWithExpand = ({ item }) => {
  const expanded = state(false);  // Created once per component
  return Div(
    Button({ onClick: () => expanded.set(!expanded.get()) }, 'Toggle'),
    when(expanded, () => Div('Details'))
  );
};
```

### 17.3 Calling .get() at Top of list() Render Functions

```javascript
// WRONG - kills all reactivity
list(items, (item) => {
  const raw = item.get();       // Static snapshot
  return Div(raw.name);         // Never updates
});

// CORRECT - use state paths
list(items, (item) => {
  return Div(
    Span(item.name),            // Reactive binding
    Button({ onClick: () => action(item.id.get()) }, 'Act')
  );
});
```

### 17.4 Using Non-Arrow Functions in when()

```javascript
// WRONG - executes immediately
when(condition, HeavyComponent(), null)

// CORRECT - deferred execution
when(condition, () => HeavyComponent(), () => null)
```

### 17.5 Mutating State Directly

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

## 18. Performance Optimization

### 18.1 Profiling

Use browser DevTools to:
1. Check for unnecessary DOM updates
2. Profile JavaScript execution
3. Monitor memory usage
4. Identify long tasks

### 18.2 Optimization Techniques

1. **Lazy Loading Components**
   ```javascript
   const LazyComponent = () => {
     const [Component, setComponent] = state(null);
     
     import('./heavy-component.js').then(mod => setComponent(mod.HeavyComponent));
     
     return when(Component, 
       (Comp) => Comp(), 
       () => Div('Loading...')
     );
   };
   ```

2. **Memoization**
   ```javascript
   const expensiveComputation = after(x, y).compute((x, y) => {
     return heavyCalculation(x, y);
   }, { hash: (x, y) => `${x}-${y}` });
   ```

3. **Debouncing Input**
   ```javascript
   const searchResults = after(query).compute(
     async (q) => fetch(`/api/search?q=${q}`).then(r => r.json()),
     { debounce: 300 }
   );
   ```

4. **Virtualization**
   ```javascript
   virtualList(largeArray, {
     render: item => Div(item.text),
     itemSize: 40,
     overscan: 2
   });
   ```

---

## 19. Testing

### 19.1 Unit Testing

Use standard testing frameworks (Jest, Vitest, etc.):

```javascript
import { describe, it, expect } from 'vitest';
import { state, after } from '@granularjs/core';

describe('state', () => {
  it('should create reactive state', () => {
    const count = state(0);
    expect(count.get()).toBe(0);
    
    count.set(1);
    expect(count.get()).toBe(1);
  });
  
  it('should react to changes', () => {
    const count = state(0);
    let value = 0;
    
    after(count).change((next) => {
      value = next;
    });
    
    count.set(1);
    expect(value).toBe(1);
  });
});
```

### 19.2 Integration Testing

Test components in real DOM:

```javascript
import { render, screen } from '@testing-library/dom';
import { Div, Button, state } from '@granularjs/core';

const Counter = () => {
  const count = state(0);
  return Div(
    Span(count),
    Button({ onClick: () => count.set(count.get() + 1) }, 'Increment')
  );
};

test('increments when button is clicked', async () => {
  render(Counter());
  
  const button = screen.getByText('Increment');
  const count = screen.getByText('0');
  
  button.click();
  expect(count.textContent).toBe('1');
});
```

---

## 20. Deployment

### 20.1 Build for Production

```bash
# Minify and generate types
npm run build:minify

# Output: dist/granular.min.js
```

### 20.2 Deploying to Production

1. **CDN**: Serve files from a CDN for faster delivery
2. **Compression**: Enable gzip or Brotli compression
3. **Caching**: Set appropriate cache headers
4. **Bundle Analysis**: Use tools like rollup-plugin-visualizer
5. **Performance Monitoring**: Set up RUM (Real User Monitoring)

### 20.3 Environment Variables

```javascript
// main.js
const apiUrl = import.meta.env.VITE_API_URL || '/api';
```

---

## Summary

Granular is a powerful framework that prioritizes performance, clarity, and control. By embracing JS-first rendering and explicit reactivity, it eliminates the complexity of traditional frameworks while providing superior performance.

Key takeaways:
- Components execute once, DOM updates granularly
- Use `state()`, `after()`, `before()`, `compute()` for reactivity
- DOM tags are functions, accept reactive values directly
- `list()` and `when()` handle dynamic content with surgical updates
- No build required, runs in the browser via ESM

Start building with Granular today and experience the difference of true fine-grained reactivity!
