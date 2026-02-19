import { isSignal, readSignal, subscribeSignal, setSignal, signal } from './signal.js';
import { isObservableArray } from '../collections/observable-array.js';
import { INTERNAL } from '../internal/symbols.js';
import { createStateFromAdapter, isState, isStatePath, readState, readStateFromRoot, subscribeState, setStateValue } from './state.js';

function freezeValue(value) {
  if (!value || typeof value !== 'object') return value;
  try {
    return Object.freeze(value);
  } catch {
    return value;
  }
}

function normalizeTargets(targets) {
  if (targets.length === 1 && Array.isArray(targets[0]) && !isObservableArray(targets[0])) return targets[0];
  return targets;
}

function readTargetValue(target) {
  if (isState(target) || isStatePath(target)) return readState(target);
  if (isSignal(target)) return readSignal(target);
  if (isObservableArray(target)) return target;
  return undefined;
}

function subscribeAfterTarget(target, fn) {
  if (isState(target) || isStatePath(target)) {
    return subscribeState(target, (next, prev) => fn(freezeValue(next), freezeValue(prev), null));
  }
  if (isSignal(target)) {
    return subscribeSignal(target, (next, prev) => fn(freezeValue(next), freezeValue(prev), null));
  }
  if (isObservableArray(target)) {
    return target.after().any((patch, ctx) => {
      const prevLen = ctx?.prevLength ?? target.length;
      const nextLen = ctx?.nextLength ?? target.length;
      const { next, prev } = makeArraySnapshots(target, patch, ctx, 'after');
      fn(next, prev, { patch, prevLength: prevLen, nextLength: nextLen, array: target });
    });
  }
  throw new Error('after(x).change: unsupported target');
}

function subscribeBeforeTarget(target, fn) {
  if (isState(target) || isStatePath(target)) {
    return target.before?.((prevRoot, nextRoot) => {
      const prev = readStateFromRoot(target, prevRoot);
      const next = nextRoot !== undefined ? readStateFromRoot(target, nextRoot) : prev;
      if (next === prev) return true;
      const res = fn(freezeValue(next), freezeValue(prev), null);
      return res !== false;
    });
  }
  if (isSignal(target)) {
    return target.before((prev, next) => fn(freezeValue(next), freezeValue(prev), null));
  }
  if (isObservableArray(target)) {
    return target.before().any((patch, ctx) => {
      const prevLen = target.length;
      const nextLen = ctx?.nextLength ?? prevLen;
      const { next, prev } = makeArraySnapshots(target, patch, ctx, 'before');
      const res = fn(next, prev, { patch, prevLength: prevLen, nextLength: nextLen, array: target });
      return res !== false;
    });
  }
  throw new Error('before(x).change: unsupported target');
}

function createComputedState() {
  const rootSignal = signal(undefined);
  const adapter = {
    kind: 'computed',
    get: () => readSignal(rootSignal),
    set: () => {
      throw new Error('Computed values are read-only.');
    },
    subscribe: (fn) => subscribeSignal(rootSignal, fn),
    before: undefined,
  };
  const proxy = createStateFromAdapter(adapter);
  const setValue = (next) => setSignal(rootSignal, next, true);
  return { value: proxy, setValue };
}

function applyPatch(baseArray, patch, ctx) {
  if (!Array.isArray(baseArray)) return [];
  const out = baseArray.slice();
  if (!patch || !patch.type) return out;
  if (patch.type === 'insert') {
    out.splice(patch.index, 0, ...(patch.items || []));
    return out;
  }
  if (patch.type === 'remove') {
    out.splice(patch.index, patch.count || 0);
    return out;
  }
  if (patch.type === 'set') {
    out[patch.index] = patch.value;
    return out;
  }
  if (patch.type === 'reset') {
    return Array.isArray(patch.items) ? patch.items.slice() : [];
  }
  return out;
}

function applyInversePatch(baseArray, patch, ctx) {
  if (!Array.isArray(baseArray)) return [];
  const out = baseArray.slice();
  if (!patch || !patch.type) return out;
  if (patch.type === 'insert') {
    out.splice(patch.index, (patch.items || []).length);
    return out;
  }
  if (patch.type === 'remove') {
    const items = patch.items || [];
    out.splice(patch.index, 0, ...items);
    return out;
  }
  if (patch.type === 'set') {
    out[patch.index] = patch.prev;
    return out;
  }
  if (patch.type === 'reset') {
    return Array.isArray(patch.prevItems) ? patch.prevItems.slice() : [];
  }
  return out;
}

function makeArraySnapshots(target, patch, ctx, phase) {
  const cached = { prev: null, next: null };
  const prev = () => {
    if (cached.prev) return cached.prev;
    cached.prev = phase === 'after' ? applyInversePatch(target, patch, ctx) : target.slice();
    return cached.prev;
  };
  const next = () => {
    if (cached.next) return cached.next;
    cached.next = phase === 'after' ? target.slice() : applyPatch(target, patch, ctx);
    return cached.next;
  };
  return { prev, next };
}

function valueForTarget(target) {
  if (isObservableArray(target)) return () => target.slice();
  return readTargetValue(target);
}

export function capture({ name, subscription }, ...targets) {
  const list = normalizeTargets(targets);

  if (!list.length) {
    throw new Error(`${name}(...targets): at least one target is required`);
  }

  const isSingleTarget = list.length === 1;

  return {
    change(fn) {
      const unsubs = list.map((target, index) => {
        let lastValue = INTERNAL.noValue;
        return subscription(target, (next, prev, ctx) => {
          const values = { next: [], prev: [], ctx: [] }
          list.map((target, index2) => {
            if (index2 === index) {
              values.next[index2] = next;
              values.prev[index2] = prev;
              values.ctx[index2] = ctx;
              return;
            }
            if (lastValue === INTERNAL.noValue) {
              lastValue = valueForTarget(target);
            }
            values.next[index2] = lastValue;
            values.prev[index2] = lastValue;
            values.ctx[index2] = null;
          })
          if (isSingleTarget) {
            return fn(values.next[0], values.prev[0], values.ctx[0])
          }
          return fn(values.next, values.prev, values.ctx)
        })
      });
      return () => {
        for (const unsub of unsubs) {
          if (typeof unsub === 'function') unsub();
        }
      };
    },
    compute(fn, options = {}) {
      const { value, setValue } = createComputedState();
      let runId = 0;
      let lastHash = undefined;
      let lastComputedValue = undefined;
      let scheduled = null;
      let disposed = false;
      let lastValues = list.map(valueForTarget);
      const equals = typeof options.equals === 'function' ? options.equals : Object.is;
      const handleError = (err) => {
        if (typeof options.onError === 'function') {
          options.onError(err);
          return;
        }
        if (typeof console !== 'undefined' && typeof console.error === 'function') {
          console.error(err);
        }
      };
      const computeNow = (nextValues, prevValues, ctxs) => {
        if (disposed) return;
        const current = ++runId;
        if (typeof options.hash === 'function') {
          let nextHash = undefined;
          try {
            nextHash = isSingleTarget
              ? options.hash(nextValues[0], prevValues[0], ctxs[0])
              : options.hash(nextValues, prevValues, ctxs);
          } catch (err) {
            handleError(err);
            return;
          }
          if (nextHash === lastHash) return;
          lastHash = nextHash;
        }
        let result;
        try {
          result = isSingleTarget
            ? fn(nextValues[0], prevValues[0], ctxs[0])
            : fn(nextValues, prevValues, ctxs);
        } catch (err) {
          handleError(err);
          return;
        }
        if (result && typeof result.then === 'function') {
          result.then((next) => {
            if (current !== runId || disposed) return;
            if (equals(lastComputedValue, next)) return;
            lastComputedValue = next;
            setValue(next);
          }).catch((err) => handleError(err));
          return;
        }
        if (equals(lastComputedValue, result)) return;
        lastComputedValue = result;
        setValue(result);
      };
      const scheduleRun = (nextValues, prevValues, ctxs) => {
        if (disposed) return;
        const delay = Math.max(0, options.debounce ?? 0);
        if (!delay) {
          computeNow(nextValues, prevValues, ctxs);
          return;
        }
        if (scheduled) clearTimeout(scheduled);
        scheduled = setTimeout(() => {
          scheduled = null;
          computeNow(nextValues, prevValues, ctxs);
        }, delay);
      };
      scheduleRun(lastValues, lastValues, list.map(() => null));
      const unsubs = list.map((target, index) => {
        return subscription(target, (next, prev, ctx) => {
          const values = { next: [], prev: [], ctx: [] }
          list.map((target, index2) => {
            if (index2 === index) {
              values.next[index2] = next;
              values.prev[index2] = prev;
              values.ctx[index2] = ctx;
              return;
            }
            values.next[index2] = valueForTarget(target);
            values.prev[index2] = lastValues[index2];
            values.ctx[index2] = null;
          })
          lastValues = values.next;
          scheduleRun(values.next, values.prev, values.ctx);
        })
      });
      Object.defineProperty(value, 'dispose', {
        value: () => {
          disposed = true;
          runId++;
          if (scheduled) clearTimeout(scheduled);
          for (const unsub of unsubs) {
            if (typeof unsub === 'function') unsub();
          }
        },
        enumerable: false,
      });
      return value;
    },
  };
}

export function after(...targets) {
  return capture({ name: 'after', subscription: subscribeAfterTarget }, ...targets);
}

export function before(...targets) {
  return capture({ name: 'before', subscription: subscribeBeforeTarget }, ...targets);
}

export function set(target, value) {
  if (isState(target) || isStatePath(target)) {
    setStateValue(target, value);
    return;
  }
  if (isSignal(target)) {
    setSignal(target, value);
    return;
  }
  if (isObservableArray(target)) {
    if (typeof target.reset !== 'function') {
      throw new Error('set(array, value): observableArray must implement reset');
    }
    target.reset(value);
    return;
  }
  throw new Error('set(target, value): unsupported target');
}

function resolveValue(value) {
  return typeof value === 'function' ? value() : value;
}

export function subscribe(target, selector, listener, equalityFn) {
  if (typeof selector !== 'function') {
    throw new Error('subscribe(target, selector, listener?): selector must be a function');
  }
  if (listener === undefined) {
    return after(target).compute((next) => selector(resolveValue(next)));
  }
  if (typeof listener !== 'function') {
    throw new Error('subscribe(target, selector, listener): listener must be a function');
  }
  const eq = typeof equalityFn === 'function' ? equalityFn : Object.is;
  let prevSelected = selector(resolveValue(readTargetValue(target)));
  return after(target).change((next) => {
    const nextSelected = selector(resolveValue(next));
    if (eq(prevSelected, nextSelected)) return;
    const p = prevSelected;
    prevSelected = nextSelected;
    listener(nextSelected, p);
  });
}
