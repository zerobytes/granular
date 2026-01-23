import { signal, setSignal, readSignal, subscribeSignal } from './signal.js';

const STATE = Symbol('zb.state');
const STATE_META = Symbol('zb.state.meta');

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

function createSetterProxy(adapter, basePath) {
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'increment') {
          return () => {
            const current = getAtPath(adapter.get(), basePath);
            const next = (Number(current) || 0) + 1;
            adapter.set(setAtPath(adapter.get(), basePath, next));
          };
        }
        if (prop === 'decrement') {
          return () => {
            const current = getAtPath(adapter.get(), basePath);
            const next = (Number(current) || 0) - 1;
            adapter.set(setAtPath(adapter.get(), basePath, next));
          };
        }
        if (prop === 'mutate') {
          return (...args) => adapter.mutate?.(...args);
        }
        if (typeof prop === 'string') {
          return createSetterProxy(adapter, basePath.concat(prop));
        }
        return undefined;
      },
      set(_t, prop, value) {
        const path = basePath.concat(String(prop));
        adapter.set(setAtPath(adapter.get(), path, value));
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
            if (p === undefined) return adapter.get();
            return getAtPath(adapter.get(), path.concat(splitPath(p)));
          };
        }
        if (prop === 'set') {
          return (...args) => {
            if (args.length === 0) return createSetterProxy(adapter, path);
            if (args.length === 1) {
              return adapter.set(setAtPath(adapter.get(), path, args[0]));
            }
            const [p, v] = args;
            if (typeof p === 'string') {
              return adapter.set(setAtPath(adapter.get(), path.concat(splitPath(p)), v));
            }
            return adapter.set(setAtPath(adapter.get(), path, p));
          };
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
        if (prop === Symbol.toPrimitive) return () => getAtPath(adapter.get(), path);
        if (prop === 'valueOf') return () => getAtPath(adapter.get(), path);
        if (prop === 'toString') return () => String(getAtPath(adapter.get(), path));

        const current = getAtPath(adapter.get(), path);
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
  const adapter = {
    kind: 'state',
    get: () => readSignal(rootSignal),
    set: (next) => setSignal(rootSignal, next, true),
    subscribe: (fn) => subscribeSignal(rootSignal, fn),
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
  return getAtPath(meta.adapter.get(), meta.path);
}

export function readStateFromRoot(value, root) {
  const meta = value?.[STATE_META];
  if (!meta) return undefined;
  return getAtPath(root, meta.path);
}

export function subscribeState(value, fn) {
  const meta = value?.[STATE_META];
  if (!meta) return null;
  return meta.adapter.subscribe((nextRoot, prevRoot) => {
    const next = getAtPath(nextRoot, meta.path);
    const prev = getAtPath(prevRoot, meta.path);
    if (next === prev) return;
    fn(next, prev);
  });
}

export function readStateMeta(meta) {
  if (!meta) return undefined;
  return getAtPath(meta.adapter.get(), meta.path);
}

export function subscribeStateMeta(meta, fn) {
  if (!meta) return null;
  return meta.adapter.subscribe((nextRoot, prevRoot) => {
    const next = getAtPath(nextRoot, meta.path);
    const prev = getAtPath(prevRoot, meta.path);
    if (next === prev) return;
    fn(next, prev);
  });
}

export function setStateValue(value, next) {
  const meta = value?.[STATE_META];
  if (!meta) return;
  return meta.adapter.set(setAtPath(meta.adapter.get(), meta.path, next));
}

export function getMappedMeta(value) {
  const meta = value?.[STATE_META];
  if (!meta || !meta.mapFn) return null;
  return meta;
}
