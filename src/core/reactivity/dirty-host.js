import { AfterFlush } from './after-flush.js';
import { INTERNAL } from '../internal/symbols.js';
import { Renderable } from '../renderable/renderable.js';
import { isObservableArray } from '../collections/observable-array.js';
import { EventHub } from '../events/event-hub.js';

/**
 * Base class that provides:
 * - property instrumentation (dirty tracking)
 * - microtask-batched flushing
 * - subscription mechanism for template bindings
 *
 * This is part of the core runtime and is inherited by `Component`.
 */
export class DirtyHost extends Renderable {
  #dirty = new Set();
  #scheduled = false;
  #subscribers = new Map();
  #boundProps = new Set();
  #values = new Map();
  #observableUnsubs = new Map();
  #events = new EventHub();

  /**
   * Registers BEFORE hooks. Handlers may return false to cancel.
   * Example: `store.before().set(({ prop, next }) => next !== null)`
   */
  before() {
    return this.#events.phase('before');
  }

  /**
   * Registers AFTER hooks.
   * Example: `store.after().flush(({ props }) => console.log(props))`
   */
  after() {
    return this.#events.phase('after');
  }

  emitBefore(type, payload, ctx) {
    return this.#events.emitBefore(type, payload, ctx);
  }

  emitAfter(type, payload, ctx) {
    this.#events.emitAfter(type, payload, ctx);
  }

  /**
   * Batches multiple assignments into a single flush.
   *
   * @param {() => void} cb
   */
  set(cb) {
    const wasScheduled = this.#scheduled;
    this.#scheduled = true;
    try {
      cb();
    } finally {
      this.#scheduled = wasScheduled;
      this.update();
    }
  }

  /**
   * Flushes all dirty properties, notifying any subscribers registered by bindings.
   * Usually you don't need to call this manually, because assignments trigger a microtask flush.
   */
  update() {
    if (this.#dirty.size === 0) return;
    const props = Array.from(this.#dirty);
    this.#dirty.clear();
    for (const prop of props) {
      const subs = this.#subscribers.get(prop);
      if (!subs) continue;
      for (const fn of subs) fn();
    }
    this.#events.emitAfter('flush', { props }, { target: this });
    AfterFlush.schedule();
  }

  /**
   * Internal: subscribes to a property changes on this instance.
   *
   * @param {string} prop
   * @param {() => void} fn
   * @returns {() => void} unsubscribe
   */
  [INTERNAL.subscribeProp](prop, fn) {
    let set = this.#subscribers.get(prop);
    if (!set) {
      set = new Set();
      this.#subscribers.set(prop, set);
    }
    set.add(fn);
    return () => set.delete(fn);
  }

  /**
   * Internal: instruments a property by defining a getter/setter on the instance.
   * The setter marks the property dirty and schedules a flush.
   *
   * @param {string} prop
   */
  [INTERNAL.instrumentBoundProp](prop) {
    if (this.#boundProps.has(prop)) return;
    this.#boundProps.add(prop);

    const desc = Object.getOwnPropertyDescriptor(this, prop);
    if (desc && desc.configurable === false) return;

    this.#values.set(prop, this[prop]);
    this.#wireObservable(prop, this.#values.get(prop));

    Object.defineProperty(this, prop, {
      get: () => this.#values.get(prop),
      set: (v) => {
        const prev = this.#values.get(prop);
        if (prev === v) return;
        const ok = this.#events.emitBefore('set', { prop, prev, next: v }, { target: this });
        if (!ok) return;
        this.#values.set(prop, v);
        this.#wireObservable(prop, v);
        this.#markDirty(prop);
        this.#events.emitAfter('set', { prop, prev, next: v }, { target: this });
      },
      enumerable: true,
      configurable: true,
    });
  }

  #wireObservable(prop, value) {
    const prevUnsub = this.#observableUnsubs.get(prop);
    if (prevUnsub) {
      prevUnsub();
      this.#observableUnsubs.delete(prop);
    }

    if (!isObservableArray(value)) return;
    if (typeof value.subscribe !== 'function') return;

    const unsub = value.subscribe(() => {
      // Array mutated without reassigning the prop; still notify.
      this.#markDirty(prop);
    });
    this.#observableUnsubs.set(prop, unsub);
  }

  #markDirty(prop) {
    this.#dirty.add(prop);
    this.#scheduleFlush();
  }

  #scheduleFlush() {
    if (this.#scheduled) return;
    this.#scheduled = true;
    queueMicrotask(() => {
      this.#scheduled = false;
      this.update();
    });
  }
}

