import { isSignal, readSignal, subscribeSignal } from './signal.js';
import { isState, isStatePath, readState, subscribeState } from './state.js';

export function isReactiveSource(value) {
  return isSignal(value) || isState(value) || isStatePath(value);
}

export function readSourceValue(value) {
  if (isSignal(value)) return readSignal(value);
  if (isState(value) || isStatePath(value)) return readState(value);
  return value;
}

export function subscribeSource(value, fn) {
  if (isSignal(value)) return subscribeSignal(value, fn);
  if (isState(value) || isStatePath(value)) return subscribeState(value, fn);
  return null;
}
