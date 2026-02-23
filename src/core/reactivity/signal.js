const SIGNAL = Symbol('g.signal');
const SIGNAL_MAP = Symbol('g.signal.map');

function isObject(value) {
  return value !== null && typeof value === 'object';
}


export function signal(initial) {
  const state = {
    [SIGNAL]: true,
    value: initial,
    subs: new Set(),
    before: new Set(),
  };

  const notify = (prev) => {
    for (const fn of state.subs) fn(state.value, prev);
  };

  const patchObject = (source, next) => {
    if (!isObject(next) || Array.isArray(next)) return false;
    const keys = Object.keys(next);
    let changed = false;
    for (const key of keys) {
      if (isObject(source[key]) && !Array.isArray(source[key])) {
        if (!source[key]) source[key] = {};
        patchObject(source[key], next[key]);
        continue;
      }
      if (next[key] === source[key]) continue;
      source[key] = next[key];
      changed = true;
    }
    return changed;
  }

  const api = {
    get() {
      return state.value;
    },
    set(next, force = false) {
      const prev = state.value;
      if (!force && prev === next) return true;
      for (const fn of state.before) {
        const res = fn(prev, next);
        if (res === false) return false;
      }
      state.value = next;
      notify(prev);
      return true;
    },
    patch(next) {
      
      if (!isObject(next) || isArray(next)) {
        return api.set(next, true);
      };
      const prev = state.value;
      const source = structuredClone(prev);
      const changed = patchObject(source, next);
      if (!changed) return false;

      for (const fn of state.before) {
        const res = fn(prev, source);
        if (res === false) return false;
      }

      state.value = source;
      notify(prev);
      return true;
    },
    subscribe(fn) {
      state.subs.add(fn);
      return () => state.subs.delete(fn);
    },
    before(fn) {
      state.before.add(fn);
      return () => state.before.delete(fn);
    },
  };

  const proxy = new Proxy(api, {
    get(_target, prop) {
      if (prop === SIGNAL) return true;
      if (prop === 'value') return state.value;
      if (prop === 'get') return api.get;
      if (prop === 'set') return api.set;
      if (prop === 'patch') return api.patch;
      if (prop === 'subscribe') return api.subscribe;
      if (prop === 'before') return api.before;
      if (prop === Symbol.toPrimitive) return () => state.value;
      if (prop === 'valueOf') return () => state.value;
      if (prop === 'toString') return () => String(state.value);

      const value = state.value;
      if (Array.isArray(value) && prop === 'map') {
        return (fn) => {
          const out = value.map(fn);
          Object.defineProperty(out, SIGNAL_MAP, { value: { signal: proxy, mapFn: fn } });
          return out;
        };
      }

      if (isObject(value)) {
        const v = value[prop];
        if (typeof v === 'function') return v.bind(value);
        return v;
      }
      return undefined;
    },
  });

  return proxy;
}

export function isSignal(value) {
  return !!value && value[SIGNAL] === true;
}

export function subscribeSignal(sig, fn) {
  return sig?.subscribe?.(fn);
}

export function readSignal(sig) {
  return sig?.get?.();
}

export function setSignal(sig, next, force = false) {
  return sig?.set?.(next, force);
}

export function patchSignal(sig, next) {
  return sig?.patch?.(next);
}

export function getMappedArrayMeta(value) {
  if (!Array.isArray(value)) return null;
  return value[SIGNAL_MAP] || null;
}
