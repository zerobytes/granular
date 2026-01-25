import { after } from './observe.js';
import { isSignal, readSignal } from './signal.js';
import { isState, isStatePath, isComputed, readState, state } from './state.js';

function asComputed(value) {
  if (isComputed(value)) return value;
  if (isSignal(value)) {
    const current = readSignal(value);
    if (typeof current === 'function') {
      return (...args) => {
        const next = readSignal(value);
        if (typeof next === 'function') return next(...args);
        return undefined;
      };
    }
    return after(value).compute((next) => next);
  }
  if (isState(value) || isStatePath(value)) {
    const current = readState(value);
    if (typeof current === 'function') {
      return (...args) => {
        const next = readState(value);
        if (typeof next === 'function') return next(...args);
        return undefined;
      };
    }
    return after(value).compute((next) => next);
  }
  if (typeof value === 'function') return value;
  return after(state(value)).compute((next) => next);
}

export function computed(input) {
  if (isSignal(input) || isState(input) || isStatePath(input)) {
    return asComputed(input);
  }
  if (!input || typeof input !== 'object') {
    return asComputed(input);
  }
  const cache = new Map();
  return new Proxy(input, {
    get(target, prop) {
      if (typeof prop === 'symbol') return target[prop];
      if (cache.has(prop)) return cache.get(prop);
      const value = target[prop];
      const resolved = asComputed(value);
      cache.set(prop, resolved);
      return resolved;
    },
  });
}
