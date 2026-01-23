/**
 * Base class that provides:
 * - property instrumentation (dirty tracking)
 * - microtask-batched flushing
 * - subscription mechanism for template bindings
 *
 * This is part of the core runtime and is inherited by `Component`.
 */
export class DirtyHost extends Renderable {
    [x: symbol]: ((prop: string, fn: () => void) => () => void) | ((prop: string) => void);
    /**
     * Registers BEFORE hooks. Handlers may return false to cancel.
     * Example: `store.before().set(({ prop, next }) => next !== null)`
     */
    before(): {
        on(type: string, fn: (payload: any, ctx: any) => (void | boolean)): () => void;
        any(fn: (payload: any, ctx: any) => (void | boolean)): () => void;
    };
    /**
     * Registers AFTER hooks.
     * Example: `store.after().flush(({ props }) => console.log(props))`
     */
    after(): {
        on(type: string, fn: (payload: any, ctx: any) => (void | boolean)): () => void;
        any(fn: (payload: any, ctx: any) => (void | boolean)): () => void;
    };
    emitBefore(type: any, payload: any, ctx: any): boolean;
    emitAfter(type: any, payload: any, ctx: any): void;
    /**
     * Batches multiple assignments into a single flush.
     *
     * @param {() => void} cb
     */
    set(cb: () => void): void;
    /**
     * Flushes all dirty properties, notifying any subscribers registered by bindings.
     * Usually you don't need to call this manually, because assignments trigger a microtask flush.
     */
    update(): void;
    #private;
}
import { Renderable } from '../renderable/renderable.js';
