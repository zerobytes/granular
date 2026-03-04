import { EventHub } from '../events/event-hub.js';

const ObservableArrayMeta = new WeakMap();

export function isObservableArray(value) {
  return !!value && typeof value === 'object' && ObservableArrayMeta.has(value);
}

function clampIndex(index, length) {
  if (index < 0) return Math.max(0, length + index);
  return Math.min(index, length);
}

export function observableArray(initial = []) {
  const target = Array.isArray(initial) ? initial.slice() : [];
  const subs = new Set();
  const hub = new EventHub();

  const notify = (patch, ctx) => {
    for (const fn of subs) fn(patch, ctx);
    hub.emitAfter(patch.type, patch, ctx || { array: proxy });
  };

  const proxy = new Proxy(target, {
    get(t, prop, receiver) {
      // Public API (preferred)
      if (prop === 'subscribe') {
        return (fn) => {
          subs.add(fn);
          return () => subs.delete(fn);
        };
      }
      if (prop === 'reset') {
        return (nextArray) => {
          const prevItems = t.slice();
          const nextItems = Array.isArray(nextArray) ? nextArray.slice() : [];
          const ctx = { array: proxy, op: 'reset', args: [nextArray], prevLength: t.length, nextLength: nextItems.length };
          const patch = { type: 'reset', items: nextItems, prevItems };
          if (!hub.emitBefore('reset', patch, ctx)) return;
          t.length = 0;
          if (Array.isArray(nextArray)) t.push(...nextArray);
          notify({ type: 'reset', items: t.slice(), prevItems }, ctx);
        };
      }
      if (prop === 'after') {
        return () => hub.phase('after');
      }
      if (prop === 'before') {
        return () => hub.phase('before');
      }

      const value = Reflect.get(t, prop, receiver);
      if (typeof value !== 'function') return value;

      if (prop === 'push') {
        return (...items) => {
          const index = t.length;
          const ctx = { array: proxy, op: 'push', args: items, prevLength: t.length, nextLength: t.length + items.length };
          const patch = { type: 'insert', index, items: items.slice() };
          if (items.length && !hub.emitBefore('insert', patch, ctx)) return t.length;
          const result = Array.prototype.push.apply(t, items);
          if (items.length) notify({ type: 'insert', index, items }, ctx);
          return result;
        };
      }
      if (prop === 'pop') {
        return () => {
          if (t.length === 0) return undefined;
          const index = t.length - 1;
          const removed = [t[index]];
          const ctx = { array: proxy, op: 'pop', args: [], prevLength: t.length, nextLength: t.length - 1 };
          const patch = { type: 'remove', index, count: 1, items: removed };
          if (!hub.emitBefore('remove', patch, ctx)) return undefined;
          const result = Array.prototype.pop.apply(t);
          notify({ type: 'remove', index, count: 1, items: removed }, ctx);
          return result;
        };
      }
      if (prop === 'unshift') {
        return (...items) => {
          const ctx = { array: proxy, op: 'unshift', args: items, prevLength: t.length, nextLength: t.length + items.length };
          const patch = { type: 'insert', index: 0, items: items.slice() };
          if (items.length && !hub.emitBefore('insert', patch, ctx)) return t.length;
          const result = Array.prototype.unshift.apply(t, items);
          if (items.length) notify({ type: 'insert', index: 0, items }, ctx);
          return result;
        };
      }
      if (prop === 'shift') {
        return () => {
          if (t.length === 0) return undefined;
          const removed = [t[0]];
          const ctx = { array: proxy, op: 'shift', args: [], prevLength: t.length, nextLength: t.length - 1 };
          const patch = { type: 'remove', index: 0, count: 1, items: removed };
          if (!hub.emitBefore('remove', patch, ctx)) return undefined;
          const result = Array.prototype.shift.apply(t);
          notify({ type: 'remove', index: 0, count: 1, items: removed }, ctx);
          return result;
        };
      }
      if (prop === 'splice') {
        return (start, deleteCount, ...items) => {
          const lenBefore = t.length;
          const index = clampIndex(Number(start) || 0, lenBefore);
          const dc =
            deleteCount === undefined ? lenBefore - index : Math.max(0, Number(deleteCount) || 0);
          const ctx = { array: proxy, op: 'splice', args: [start, deleteCount, ...items], prevLength: t.length, nextLength: t.length - dc + items.length };
          if (dc) {
            const removePatch = { type: 'remove', index, count: dc, items: t.slice(index, index + dc) };
            if (!hub.emitBefore('remove', removePatch, ctx)) return [];
          }
          if (items.length) {
            const insertPatch = { type: 'insert', index, items: items.slice() };
            if (!hub.emitBefore('insert', insertPatch, ctx)) return [];
          }
          const removed = Array.prototype.splice.apply(t, [index, dc, ...items]);
          if (dc) notify({ type: 'remove', index, count: dc, items: removed }, ctx);
          if (items.length) notify({ type: 'insert', index, items }, ctx);
          return removed;
        };
      }
      if (prop === 'sort') {
        return (compareFn) => {
          const prevItems = t.slice();
          const ctx = { array: proxy, op: 'sort', args: [compareFn], prevLength: t.length, nextLength: t.length };
          const patch = { type: 'reset', items: null, prevItems };
          if (!hub.emitBefore('reset', patch, ctx)) return proxy;
          Array.prototype.sort.call(t, compareFn);
          patch.items = t.slice();
          notify(patch, ctx);
          return proxy;
        };
      }
      if (prop === 'reverse') {
        return () => {
          const prevItems = t.slice();
          const ctx = { array: proxy, op: 'reverse', args: [], prevLength: t.length, nextLength: t.length };
          const patch = { type: 'reset', items: null, prevItems };
          if (!hub.emitBefore('reset', patch, ctx)) return proxy;
          Array.prototype.reverse.call(t);
          patch.items = t.slice();
          notify(patch, ctx);
          return proxy;
        };
      }
      if (prop === 'fill') {
        return (value, start, end) => {
          const prevItems = t.slice();
          const ctx = { array: proxy, op: 'fill', args: [value, start, end], prevLength: t.length, nextLength: t.length };
          const patch = { type: 'reset', items: null, prevItems };
          if (!hub.emitBefore('reset', patch, ctx)) return proxy;
          Array.prototype.fill.call(t, value, start, end);
          patch.items = t.slice();
          notify(patch, ctx);
          return proxy;
        };
      }
      if (prop === 'copyWithin') {
        return (target, start, end) => {
          const prevItems = t.slice();
          const ctx = { array: proxy, op: 'copyWithin', args: [target, start, end], prevLength: t.length, nextLength: t.length };
          const patch = { type: 'reset', items: null, prevItems };
          if (!hub.emitBefore('reset', patch, ctx)) return proxy;
          Array.prototype.copyWithin.call(t, target, start, end);
          patch.items = t.slice();
          notify(patch, ctx);
          return proxy;
        };
      }

      return value.bind(t);
    },
    set(t, prop, value, receiver) {
      if (prop === 'length') {
        const prev = t.length;
        const next = Number(value) || 0;
        const prevItems = t.slice();
        const removed = next < prev ? t.slice(next, prev) : [];
        const ctx = { array: proxy, op: 'length', args: [next], prevLength: prev, nextLength: next };
        const ok = Reflect.set(t, prop, next, receiver);
        if (ok && next < prev) {
          const patch = { type: 'remove', index: next, count: prev - next, items: removed };
          if (hub.emitBefore('remove', patch, ctx)) notify(patch, ctx);
        }
        if (ok && next > prev) {
          notify({ type: 'reset', items: t.slice(), prevItems }, ctx);
        }
        return ok;
      }

      const index = typeof prop === 'string' && /^\d+$/.test(prop) ? Number(prop) : null;
      if (index == null) return Reflect.set(t, prop, value, receiver);

      const lenBefore = t.length;
      const prevValue = index < t.length ? t[index] : undefined;
      const ctx = { array: proxy, op: 'set', args: [prop, value], prevLength: t.length, nextLength: t.length };
      const ok = Reflect.set(t, prop, value, receiver);
      if (!ok) return false;

      if (index < lenBefore) {
        const patch = { type: 'set', index, value, prev: prevValue };
        if (hub.emitBefore('set', patch, ctx)) notify(patch, ctx);
        return true;
      }

      if (index === lenBefore) {
        const patch = { type: 'insert', index, items: [value] };
        ctx.nextLength = t.length;
        if (hub.emitBefore('insert', patch, ctx)) notify(patch, ctx);
        return true;
      }

      const prevItems = t.slice(0, lenBefore);
      notify({ type: 'reset', items: t.slice(), prevItems }, ctx);
      return true;
    },
  });

  ObservableArrayMeta.set(proxy, { target, subs });
  return proxy;
}

/**
 * @typedef {Object} ObservableArrayPatchInsert
 * @property {'insert'} type
 * @property {number} index
 * @property {any[]} items
 */
/**
 * @typedef {Object} ObservableArrayPatchRemove
 * @property {'remove'} type
 * @property {number} index
 * @property {number} count
 * @property {any[]} items
 */
/**
 * @typedef {Object} ObservableArrayPatchSet
 * @property {'set'} type
 * @property {number} index
 * @property {any} value
 * @property {any} prev
 */
/**
 * @typedef {Object} ObservableArrayPatchReset
 * @property {'reset'} type
 * @property {any[]} items
 * @property {any[]} prevItems
 */
/**
 * @typedef {ObservableArrayPatchInsert|ObservableArrayPatchRemove|ObservableArrayPatchSet|ObservableArrayPatchReset} ObservableArrayPatch
 */

