import { isObservableArray } from '../collections/observable-array.js';
import { isState, isStatePath, readState, setStateValue } from './state.js';
import { after } from './observe.js';

function isStoreLike(value) {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof value.getState === 'function' &&
    typeof value.setState === 'function' &&
    typeof value.subscribe === 'function'
  );
}

function isStateLike(value) {
  return isState(value) || isStatePath(value);
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

function normalizePaths(paths) {
  if (!paths || !paths.length) return null;
  return paths.map((p) => String(p).split('.').map((s) => s.trim()).filter(Boolean));
}

function pickPaths(value, pathList) {
  if (!pathList) return value;
  let next = value;
  for (const path of pathList) {
    const v = getAtPath(value, path);
    next = setAtPath(next, path, v);
  }
  return next;
}

function defaultSerialize(value) {
  return JSON.stringify(value, (_key, v) => {
    if (typeof v === 'function') return undefined;
    if (typeof v === 'symbol') return undefined;
    return v;
  });
}

function defaultDeserialize(text) {
  return JSON.parse(text);
}

function readSnapshot(target, pathList) {
  if (isStateLike(target)) return pickPaths(readState(target), pathList);
  if (isObservableArray(target)) return pickPaths(target.slice(), pathList);
  if (isStoreLike(target)) return pickPaths(target.getState(), pathList);
  throw new Error('persist(target): unsupported target');
}

function applySnapshot(target, snapshot) {
  if (isStateLike(target)) {
    setStateValue(target, snapshot);
    return;
  }
  if (isObservableArray(target)) {
    target.reset(Array.isArray(snapshot) ? snapshot : []);
    return;
  }
  if (isStoreLike(target)) {
    target.setState(snapshot, true);
    return;
  }
  throw new Error('persist(target): unsupported target');
}

function subscribeChanges(target, fn) {
  if (isStateLike(target)) return after(target).change(fn);
  if (isObservableArray(target)) return after(target).change(fn);
  if (isStoreLike(target)) return target.subscribe(fn);
  throw new Error('persist(target): unsupported target');
}

function safeStorage(storage) {
  try {
    if (!storage || typeof storage.getItem !== 'function') return null;
    return storage;
  } catch {
    return null;
  }
}

export function persist(target, options = {}) {
  const key = options.key;
  if (!key) throw new Error('persist(target): options.key is required');

  const storage = safeStorage(options.storage ?? (typeof localStorage !== 'undefined' ? localStorage : null));
  const pathList = normalizePaths(options.paths);
  const serialize = options.serialize || defaultSerialize;
  const deserialize = options.deserialize || defaultDeserialize;
  const version = options.version ?? 1;
  const migrate = options.migrate || null;
  const reconcile = options.reconcile || null;
  const throttleMs = Math.max(0, options.throttle ?? 0);

  if (!storage) throw new Error('persist(target): no storage available');

  const raw = storage.getItem(key);
  if (raw != null) {
    let payload = null;
    try {
      payload = deserialize(raw);
    } catch {
      payload = null;
    }
    if (payload != null) {
      let data = payload;
      let v = null;
      if (payload && typeof payload === 'object' && 'data' in payload && 'v' in payload) {
        data = payload.data;
        v = payload.v;
      }
      if (v != null && v !== version && typeof migrate === 'function') {
        data = migrate(data, v);
      }
      if (typeof reconcile === 'function') {
        data = reconcile(data);
      }
      if (data !== undefined) {
        applySnapshot(target, data);
      }
    }
  }


  let scheduled = false;
  let lastTimer = null;

  const write = () => {
    scheduled = false;
    const snapshot = readSnapshot(target, pathList);
    const payload = { v: version, data: snapshot };
    try {
      storage?.setItem?.(key, serialize(payload));
    } catch {
      return;
    }
  };

  if(!raw){
    write();
  }

  const scheduleWrite = () => {
    if (!storage) return;
    if (throttleMs <= 0) {
      write();
      return;
    }
    if (scheduled) return;
    scheduled = true;
    lastTimer = setTimeout(write, throttleMs);
  };

  const unsubscribe = subscribeChanges(target, scheduleWrite);

  Object.defineProperty(target, 'persistDispose', {
    value: () => {
      if (lastTimer) clearTimeout(lastTimer);
      if (typeof unsubscribe === 'function') unsubscribe();
    },
    enumerable: false,
  });

  return target;
}
