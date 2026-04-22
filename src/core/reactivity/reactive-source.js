import { isSignal, readSignal, subscribeSignal } from './signal.js';
import { isState, isStatePath, readState, subscribeState } from './state.js';
import { isObservableArray } from '../collections/observable-array.js';

export function isReactiveSource(value) {
  return isSignal(value) || isState(value) || isStatePath(value) || isObservableArray(value);
}

export function readSourceValue(value) {
  if (isSignal(value)) return readSignal(value);
  if (isState(value) || isStatePath(value)) return readState(value);
  if (isObservableArray(value)) return value;
  return value;
}

export function subscribeSource(value, fn) {
  if (isSignal(value)) return subscribeSignal(value, fn);
  if (isState(value) || isStatePath(value)) return subscribeState(value, fn);
  if (isObservableArray(value)) return value.subscribe(fn);
  return null;
}
