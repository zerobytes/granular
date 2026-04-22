import { after } from './observe.js';
import { signal, readSignal, setSignal, subscribeSignal } from './signal.js';
import { collectDependencies } from './tracker.js';
import { isReactiveSource, readSourceValue, subscribeSource } from './reactive-source.js';
import { resolve } from './resolve.js';

/**
 * Lifts a binary comparison so it works with any combination of
 * (reactive, reactive), (reactive, value), (value, reactive), (value, value).
 * The compute closure always sees plain values; subscriptions are only set up
 * for the operands that are actually reactive.
 */
function liftBinary(a, b, fn) {
  const aReactive = isReactiveSource(a);
  const bReactive = isReactiveSource(b);
  if (!aReactive && !bReactive) return fn(a, b);
  if (aReactive && bReactive) {
    return after(a, b).compute(([av, bv]) => fn(av, bv));
  }
  if (aReactive) {
    return after(a).compute((av) => fn(av, b));
  }
  return after(b).compute((bv) => fn(a, bv));
}

/**
 * Lifts a unary operator so it works with reactive and plain values.
 */
function liftUnary(a, fn) {
  if (!isReactiveSource(a)) return fn(a);
  return after(a).compute((av) => fn(av));
}

export function equals(a, b) { return liftBinary(a, b, (x, y) => x === y); }
export function differs(a, b) { return liftBinary(a, b, (x, y) => x !== y); }
export function like(a, b) { return liftBinary(a, b, (x, y) => x == y); }
export function unlike(a, b) { return liftBinary(a, b, (x, y) => x != y); }
export function bigger(a, b) { return liftBinary(a, b, (x, y) => x > y); }
export function smaller(a, b) { return liftBinary(a, b, (x, y) => x < y); }
export function atLeast(a, b) { return liftBinary(a, b, (x, y) => x >= y); }
export function atMost(a, b) { return liftBinary(a, b, (x, y) => x <= y); }
export function not(a) { return liftUnary(a, (x) => !x); }

/**
 * `and(...sources)` — short-circuits on the first falsy value but stays
 * reactive in the operands that are reactive sources. Plain falsy values
 * collapse the whole expression to a constant `false`.
 */
export function and(...sources) {
  if (sources.length === 0) return true;
  for (const s of sources) {
    if (!isReactiveSource(s) && !s) return false;
  }
  const reactive = sources.filter(isReactiveSource);
  if (reactive.length === 0) return sources.every(Boolean);
  if (reactive.length === 1) {
    return after(reactive[0]).compute((v) => Boolean(v) && sources.every((s) => isReactiveSource(s) ? true : Boolean(s)));
  }
  return after(...reactive).compute((values) => {
    for (let i = 0, j = 0; i < sources.length; i++) {
      const s = sources[i];
      const v = isReactiveSource(s) ? values[j++] : s;
      if (!v) return false;
    }
    return true;
  });
}

/**
 * `or(...sources)` — mirror of `and` for OR semantics.
 */
export function or(...sources) {
  if (sources.length === 0) return false;
  for (const s of sources) {
    if (!isReactiveSource(s) && s) return true;
  }
  const reactive = sources.filter(isReactiveSource);
  if (reactive.length === 0) return sources.some(Boolean);
  if (reactive.length === 1) {
    return after(reactive[0]).compute((v) => Boolean(v) || sources.some((s) => isReactiveSource(s) ? false : Boolean(s)));
  }
  return after(...reactive).compute((values) => {
    for (let i = 0, j = 0; i < sources.length; i++) {
      const s = sources[i];
      const v = isReactiveSource(s) ? values[j++] : s;
      if (v) return true;
    }
    return false;
  });
}

export function derive(fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('derive() expects a function as argument.');
  }

  const { value: initial, deps: initialDeps } = collectDependencies(fn);
  const sig = signal(initial);
  const trackedDeps = new Set();
  const unsubs = new Map();

  const wireDep = (dep) => {
    if (trackedDeps.has(dep)) return;
    if (!isReactiveSource(dep)) return;
    const unsub = subscribeSource(dep, recompute);
    if (typeof unsub === 'function') {
      trackedDeps.add(dep);
      unsubs.set(dep, unsub);
    }
  };

  function recompute() {
    const { value, deps } = collectDependencies(fn);
    setSignal(sig, value);
    for (const dep of deps) wireDep(dep);
  }

  for (const dep of initialDeps) wireDep(dep);

  const dispose = () => {
    for (const unsub of unsubs.values()) {
      try { unsub(); } catch {}
    }
    unsubs.clear();
    trackedDeps.clear();
  };

  const wrapped = new Proxy(sig, {
    get(target, prop, receiver) {
      if (prop === 'dispose') return dispose;
      return Reflect.get(target, prop, receiver);
    },
  });

  return wrapped;
}

// ---------------------------------------------------------------------------
// Backwards-compatible short aliases. Will be removed in a future major.
// Prefer the long forms (equals, differs, bigger, smaller, atLeast, atMost).
// ---------------------------------------------------------------------------
export const eq = equals;
export const neq = differs;
export const gt = bigger;
export const gte = atLeast;
export const lt = smaller;
export const lte = atMost;
