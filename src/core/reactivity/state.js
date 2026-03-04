import { signal, setSignal, readSignal, subscribeSignal, patchSignal } from './signal.js';

const STATE = Symbol('g.state');
const STATE_META = Symbol('g.state.meta');

function isObject(value) {
  return value !== null && typeof value === 'object';
}

function splitPath(path) {
  if (!path) return [];
  if (Array.isArray(path)) return path;
  return String(path)
    .split('.')
    .map((p) => p.trim())
    .filter(Boolean);
}

function getAtPath(obj, path) {
  let cur = obj;
  for (const key of path) {
    if (!cur) return undefined;
    cur = cur[key];
  }
  return cur;
}

function mergeDefaults(base, next) {
  if (!isObject(base) || !isObject(next)) return isObject(next) ? { ...next } : next;
  const out = { ...base };
  for (const key of Object.keys(next)) {
    const baseValue = base[key];
    const nextValue = next[key];
    if (isObject(baseValue) && isObject(nextValue)) {
      out[key] = mergeDefaults(baseValue, nextValue);
      continue;
    }
    out[key] = nextValue;
  }
  return out;
}

function normalizeWhen(when) {
  if (typeof when === 'function') return when;
  if (when === 'nullish') return (value) => value == null;
  return (value) => value === undefined;
}

function resolveValue(adapter, path, root) {
  const currentRoot = root === undefined ? adapter.get() : root;
  const value = getAtPath(currentRoot, path);
  const defaults = adapter.defaults;
  if (!defaults) return value;
  const shouldDefault = adapter.defaultsWhen(value);
  if (!shouldDefault) return value;
  const fallback = getAtPath(defaults, path);
  if (fallback === undefined) return value;
  if (typeof fallback === 'function') {
    return fallback({ value, path, root: currentRoot });
  }
  return fallback;
}

function setAtPath(obj, path, value) {
  if (!path.length) return value;
  const root = Array.isArray(obj) ? obj.slice() : { ...(obj || {}) };
  let cur = root;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    const next = cur[key];
    const cloned = Array.isArray(next) ? next.slice() : { ...(next || {}) };
    cur[key] = cloned;
    cur = cloned;
  }
  cur[path[path.length - 1]] = value;
  return root;
}

function createPathTrie() {
  const root = { subs: null, children: null };

  const getOrCreate = (path) => {
    let node = root;
    for (const seg of path) {
      if (!node.children) node.children = new Map();
      let child = node.children.get(seg);
      if (!child) {
        child = { subs: null, children: null };
        node.children.set(seg, child);
      }
      node = child;
    }
    return node;
  };

  const add = (path, fn) => {
    const node = getOrCreate(path);
    if (!node.subs) node.subs = new Set();
    node.subs.add(fn);
    return () => {
      node.subs.delete(fn);
      if (node.subs.size === 0) node.subs = null;
    };
  };

  const notifyNode = (node, next, prev) => {
    if (node.subs) {
      for (const fn of node.subs) fn(next, prev);
    }
  };

  const notifyDescendants = (node, next, prev) => {
    notifyNode(node, next, prev);
    if (node.children) {
      for (const child of node.children.values()) {
        notifyDescendants(child, next, prev);
      }
    }
  };

  const notifyAffected = (changedPath, next, prev) => {
    let node = root;
    for (let i = 0; i < changedPath.length; i++) {
      const seg = changedPath[i];
      if (!node.children) return;
      const child = node.children.get(seg);
      if (!child) return;
      if (i < changedPath.length - 1) {
        notifyNode(child, next, prev);
      } else {
        notifyDescendants(child, next, prev);
      }
      node = child;
    }
  };

  const notifyAll = (next, prev) => {
    notifyDescendants(root, next, prev);
  };

  return { add, notifyAffected, notifyAll };
}

const ARRAY_MUTATORS = {
  push: (arr, args) => { const a = arr.slice(); a.push(...args); return a; },
  pop: (arr) => arr.slice(0, -1),
  shift: (arr) => arr.slice(1),
  unshift: (arr, args) => { const a = args.slice(); a.push(...arr); return a; },
  splice: (arr, args) => { const a = arr.slice(); a.splice(...args); return a; },
  sort: (arr, args) => arr.slice().sort(args[0]),
  reverse: (arr) => arr.slice().reverse(),
  fill: (arr, args) => arr.slice().fill(...args),
  copyWithin: (arr, args) => arr.slice().copyWithin(...args),
};

const ARRAY_RETURN = {
  push: (arr, args) => arr.length + args.length,
  pop: (arr) => arr[arr.length - 1],
  shift: (arr) => arr[0],
  splice: (arr, args) => {
    const start = Number(args[0]) || 0;
    const dc = args.length > 1 ? (Number(args[1]) || 0) : arr.length - start;
    return arr.slice(start, start + dc);
  },
};

function createSetterProxy(adapter, basePath) {
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'increment') {
          return () => {
            const current = getAtPath(adapter.get(), basePath);
            const next = (Number(current) || 0) + 1;
            adapter.set(setAtPath(adapter.get(), basePath, next), basePath);
          };
        }
        if (prop === 'decrement') {
          return () => {
            const current = getAtPath(adapter.get(), basePath);
            const next = (Number(current) || 0) - 1;
            adapter.set(setAtPath(adapter.get(), basePath, next), basePath);
          };
        }
        if (prop === 'mutate') {
          return (...args) => adapter.mutate?.(...args);
        }
        if (prop in ARRAY_MUTATORS) {
          return (...args) => {
            const current = getAtPath(adapter.get(), basePath);
            if (!Array.isArray(current)) return undefined;
            const retFn = ARRAY_RETURN[prop];
            const ret = retFn ? retFn(current, args) : undefined;
            const next = ARRAY_MUTATORS[prop](current, args);
            adapter.set(setAtPath(adapter.get(), basePath, next), basePath);
            return ret !== undefined ? ret : next;
          };
        }
        if (typeof prop === 'string') {
          return createSetterProxy(adapter, basePath.concat(prop));
        }
        return undefined;
      },
      set(_t, prop, value) {
        const path = basePath.concat(String(prop));
        adapter.set(setAtPath(adapter.get(), path, value), path);
        return true;
      },
    }
  );
}

function createStateProxy(adapter, path = []) {
  const meta = { adapter, path };
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === STATE) return true;
        if (prop === STATE_META) return meta;
        if (prop === 'get') {
          return (p) => {
            if (p === undefined) return resolveValue(adapter, path);
            return resolveValue(adapter, path.concat(splitPath(p)));
          };
        }
        if (prop === 'set') {
          return (...args) => {
            if (args.length === 0) return createSetterProxy(adapter, path);
            if (args.length === 1) {
              return adapter.set(setAtPath(adapter.get(), path, args[0]), path);
            }
            const [p, v] = args;
            if (typeof p === 'string') {
              const full = path.concat(splitPath(p));
              return adapter.set(setAtPath(adapter.get(), full, v), full);
            }
            return adapter.set(setAtPath(adapter.get(), path, p), path);
          };
        }
        if(prop === 'patch') {
          return adapter.patch;
        }
        if (prop === 'subscribe') {
          return (fn) => adapter.subscribe(fn);
        }
        if (prop === 'before') {
          return adapter.before;
        }
        if (prop === 'mutate') {
          return (...args) => adapter.mutate?.(...args);
        }
        if (prop === Symbol.toPrimitive) return () => resolveValue(adapter, path);
        if (prop === 'valueOf') return () => resolveValue(adapter, path);
        if (prop === 'toString') return () => String(resolveValue(adapter, path));

        const current = resolveValue(adapter, path);
        if (Array.isArray(current) && prop === 'map') {
          return (fn) => {
            const out = current.map(fn);
            Object.defineProperty(out, STATE_META, { value: { adapter, path, mapFn: fn } });
            return out;
          };
        }

        if (isObject(current) && typeof prop === 'string') {
          return createStateProxy(adapter, path.concat(prop));
        }
        return undefined;
      },
      set(_t, prop, value) {
        if (typeof prop === 'string') {
          throw new Error(`Direct mutation is not allowed. Use .set().${prop} = value or .set("${path.concat(prop).join('.')}", value).`);
        }
        return false;
      },
    }
  );
}

export function state(initial) {
  const rootSignal = signal(initial);
  const rootSubs = new Set();
  const trie = createPathTrie();
  let _changedPath = null;

  subscribeSignal(rootSignal, (next, prev) => {
    const cp = _changedPath;
    _changedPath = null;
    for (const fn of rootSubs) fn(next, prev);
    if (cp && cp.length > 0) {
      trie.notifyAffected(cp, next, prev);
    } else {
      trie.notifyAll(next, prev);
    }
  });

  const adapter = {
    kind: 'state',
    get: () => readSignal(rootSignal),
    set: (next, changedPath) => {
      _changedPath = changedPath || null;
      return setSignal(rootSignal, next, true);
    },
    patch: (next) => patchSignal(rootSignal, next),
    subscribe: (fn, path) => {
      if (!path || path.length === 0) {
        rootSubs.add(fn);
        return () => rootSubs.delete(fn);
      }
      return trie.add(path, fn);
    },
    before: rootSignal.before,
    mutate: (optimistic, mutation, options = {}) => mutateAdapter(adapter, optimistic, mutation, options),
  };
  return createStateFromAdapter(adapter);
}

export function createStateFromAdapter(adapter) {
  const proxy = createStateProxy(adapter, []);
  Object.defineProperty(proxy, STATE, { value: true });
  return proxy;
}

function cloneForSnapshot(value, options) {
  if (typeof options.clone === 'function') return options.clone(value);
  return value;
}

export async function mutateAdapter(adapter, optimistic, mutation, options = {}) {
  if (typeof optimistic !== 'function' || typeof mutation !== 'function') {
    throw new Error('mutate(optimistic, mutation, options?): invalid arguments');
  }
  const prev = cloneForSnapshot(adapter.get(), options);
  optimistic();
  try {
    const result = await mutation();
    return result;
  } catch (err) {
    if (typeof options.rollback === 'function') {
      options.rollback(err, prev);
    } else {
      adapter.set(prev);
    }
    throw err;
  }
}

export function isState(value) {
  return !!value && value[STATE] === true;
}

export function isComputed(value) {
  const meta = value?.[STATE_META];
  return !!meta && meta.adapter?.kind === 'computed';
}

export function isStatePath(value) {
  return !!value && value[STATE_META];
}

export function readState(value) {
  const meta = value?.[STATE_META];
  if (!meta) return undefined;
  return resolveValue(meta.adapter, meta.path);
}

export function readStateFromRoot(value, root) {
  const meta = value?.[STATE_META];
  if (!meta) return undefined;
  return resolveValue(meta.adapter, meta.path, root);
}

export function subscribeState(value, fn) {
  const meta = value?.[STATE_META];
  if (!meta) return null;
  return meta.adapter.subscribe((nextRoot, prevRoot) => {
    const next = resolveValue(meta.adapter, meta.path, nextRoot);
    const prev = resolveValue(meta.adapter, meta.path, prevRoot);
    if (next === prev) return;
    fn(next, prev);
  }, meta.path);
}

export function readStateMeta(meta) {
  if (!meta) return undefined;
  return resolveValue(meta.adapter, meta.path);
}

export function subscribeStateMeta(meta, fn) {
  if (!meta) return null;
  return meta.adapter.subscribe((nextRoot, prevRoot) => {
    const next = resolveValue(meta.adapter, meta.path, nextRoot);
    const prev = resolveValue(meta.adapter, meta.path, prevRoot);
    if (next === prev) return;
    fn(next, prev);
  }, meta.path);
}

export function setStateValue(value, next) {
  const meta = value?.[STATE_META];
  if (!meta) return;
  return meta.adapter.set(setAtPath(meta.adapter.get(), meta.path, next), meta.path);
}

export function getMappedMeta(value) {
  const meta = value?.[STATE_META];
  if (!meta || !meta.mapFn) return null;
  return meta;
}

export function withDefaults(target, defaults, options = {}) {
  const meta = target?.[STATE_META];
  if (!meta) {
    throw new Error('withDefaults(target, defaults, options?): target must be a state or state path');
  }
  const adapter = meta.adapter;
  adapter.defaultsWhen = options.when === undefined ? (adapter.defaultsWhen ?? normalizeWhen()) : normalizeWhen(options.when);
  adapter.defaults = adapter.defaults ? mergeDefaults(adapter.defaults, defaults) : defaults;
  return target;
}
