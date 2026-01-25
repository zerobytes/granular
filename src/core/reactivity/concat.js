import { after } from './observe.js';
import { resolve } from './resolve.js';
import { isSignal } from './signal.js';
import { isState, isStatePath, isComputed } from './state.js';

function isObject(value) {
  return value !== null && typeof value === 'object';
}

function isReactive(value) {
  return isSignal(value) || isState(value) || isStatePath(value) || isComputed(value);
}

function isTuple(value) {
  if (!Array.isArray(value) || value.length !== 2) return false;
  const source = value[0];
  const mapper = value[1];
  if (isReactive(source)) return typeof mapper === 'function' || typeof mapper === 'string';
  return typeof mapper === 'function' || typeof mapper === 'string';
}

function normalizeParts(values, out = []) {
  for (const value of values) {
    if (isTuple(value)) {
      out.push(value);
      continue;
    }
    if (Array.isArray(value)) {
      normalizeParts(value, out);
      continue;
    }
    out.push(value);
  }
  return out;
}

function extractOptions(parts) {
  if (!parts.length) return { parts, options: { separator: '', filterFalsy: false } };
  const last = parts[parts.length - 1];
  if (
    isObject(last) &&
    !Array.isArray(last) &&
    !isReactive(last) &&
    (Object.prototype.hasOwnProperty.call(last, 'separator') ||
      Object.prototype.hasOwnProperty.call(last, 'filterFalsy'))
  ) {
    const options = {
      separator: last.separator ?? '',
      filterFalsy: last.filterFalsy ?? false,
    };
    return { parts: parts.slice(0, -1), options };
  }
  return { parts, options: { separator: '', filterFalsy: false } };
}

function collectTargets(value, targets) {
  if (isReactive(value)) targets.push(value);
  if (Array.isArray(value) && value.length) {
    const source = value[0];
    if (isReactive(source)) targets.push(source);
  }
}

function resolvePart(part) {
  if (Array.isArray(part)) {
    const source = part[0];
    const mapper = part[1];
    const value = resolve(source);
    if (typeof mapper === 'function') return mapper(value);
    if (typeof mapper === 'string') return value ? mapper : '';
    return value;
  }
  if (typeof part === 'function') return part();
  return resolve(part);
}

export function concat(...input) {
  const normalized = normalizeParts(input);
  const { parts, options } = extractOptions(normalized);
  const targets = [];
  for (const part of parts) collectTargets(part, targets);
  const build = () => {
    const values = parts.map(resolvePart).map((value) => (value == null ? '' : String(value)));
    const filtered = options.filterFalsy ? values.filter(Boolean) : values;
    return filtered.join(options.separator);
  };
  if (!targets.length) return build();
  return after(targets).compute(build);
}
