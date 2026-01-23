import { state } from '../reactivity/state.js';
import { after } from '../reactivity/observe.js';

function isObject(value) {
  return value !== null && typeof value === 'object';
}

function cloneValue(value) {
  if (!isObject(value)) return value;
  if (Array.isArray(value)) return value.map(cloneValue);
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = cloneValue(v);
  }
  return out;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (!isObject(a) || !isObject(b)) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

function mergeErrors(target, value) {
  if (value == null || value === true) return target;
  if (value === false) {
    target._form = true;
    return target;
  }
  if (typeof value === 'string') {
    target._form = value;
    return target;
  }
  if (isObject(value)) {
    for (const [k, v] of Object.entries(value)) {
      target[k] = v;
    }
    return target;
  }
  return target;
}

export function form(initial) {
  const initialSnapshot = cloneValue(initial);
  const values = state(cloneValue(initial));
  const meta = state({});
  const errors = state({});
  const touched = state({});
  const dirty = state(false);
  const validators = new Set();

  let runId = 0;

  const runValidators = () => {
    const current = ++runId;
    const nextErrors = {};
    const snapshot = values.get();
    const tasks = [];

    for (const validator of validators) {
      try {
        const result = validator(snapshot);
        if (result && typeof result.then === 'function') {
          tasks.push(
            result.then((value) => {
              mergeErrors(nextErrors, value);
            })
          );
        } else {
          mergeErrors(nextErrors, result);
        }
      } catch (err) {
        mergeErrors(nextErrors, err?.message || true);
      }
    }

    if (tasks.length) {
      Promise.all(tasks).then(() => {
        if (current !== runId) return;
        errors.set(nextErrors);
      });
      return;
    }

    errors.set(nextErrors);
  };

  after(values).change(() => {
    const isDirty = !deepEqual(values.get(), initialSnapshot);
    if (dirty.get() !== isDirty) dirty.set(isDirty);
    if (validators.size) runValidators();
  });

  const reset = () => {
    values.set(cloneValue(initialSnapshot));
    touched.set({});
    errors.set({});
    dirty.set(false);
    meta.set({});
  };

  return {
    values,
    meta,
    errors,
    touched,
    dirty,
    validators,
    reset,
  };
}
