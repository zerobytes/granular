/**
 * Minimal before/after event hub.
 *
 * - `before` handlers may return `false` to cancel the operation.
 * - `after` handlers are fire-and-forget.
 */
export class EventHub {
  #before = new Map(); // type -> Set<fn>
  #after = new Map(); // type -> Set<fn>
  #afterAny = new Set();

  /**
   * @param {'before'|'after'} phase
   * @param {string} type
   * @param {(payload: any, ctx: any) => (void|boolean)} fn
   * @returns {() => void}
   */
  on(phase, type, fn) {
    const map = phase === 'before' ? this.#before : this.#after;
    if (phase === 'after' && type === '*') {
      this.#afterAny.add(fn);
      return () => this.#afterAny.delete(fn);
    }
    let set = map.get(type);
    if (!set) {
      set = new Set();
      map.set(type, set);
    }
    set.add(fn);
    return () => set.delete(fn);
  }

  /**
   * Emits a before event. Returns false when cancelled.
   * @param {string} type
   * @param {any} payload
   * @param {any} ctx
   * @returns {boolean}
   */
  emitBefore(type, payload, ctx) {
    const set = this.#before.get(type);
    if (!set) return true;
    for (const fn of set) {
      const r = fn(payload, ctx);
      if (r === false) return false;
    }
    return true;
  }

  /**
   * Emits an after event.
   * @param {string} type
   * @param {any} payload
   * @param {any} ctx
   */
  emitAfter(type, payload, ctx) {
    const set = this.#after.get(type);
    if (set) {
      for (const fn of set) fn(payload, ctx);
    }
    for (const fn of this.#afterAny) fn(payload, ctx);
  }

  /**
   * Returns a fluent API for registering hooks.
   * @param {'before'|'after'} phase
   */
  phase(phase) {
    const hub = this;
    const api = {
      /**
       * Registers a handler for a given type.
       * @param {string} type
       * @param {(payload: any, ctx: any) => (void|boolean)} fn
       */
      on(type, fn) {
        return hub.on(phase, type, fn);
      },
      /**
       * Registers a handler for any type.
       * @param {(payload: any, ctx: any) => (void|boolean)} fn
       */
      any(fn) {
        return hub.on(phase, '*', fn);
      },
    };

    return new Proxy(api, {
      get(target, prop) {
        if (typeof prop !== 'string') return target[prop];
        if (prop in target) return target[prop];
        return (fn) => hub.on(phase, prop, fn);
      },
    });
  }
}

