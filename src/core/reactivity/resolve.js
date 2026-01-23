import { isSignal, readSignal } from './signal.js';
import { isState, isStatePath, readState } from './state.js';

export function resolve(value) {
  if (isSignal(value)) return readSignal(value);
  if (isState(value) || isStatePath(value)) return readState(value);
  return value;
}
