/**
 * Minimal before/after event hub.
 *
 * - `before` handlers may return `false` to cancel the operation.
 * - `after` handlers are fire-and-forget.
 */
export class EventHub {
    /**
     * @param {'before'|'after'} phase
     * @param {string} type
     * @param {(payload: any, ctx: any) => (void|boolean)} fn
     * @returns {() => void}
     */
    on(phase: "before" | "after", type: string, fn: (payload: any, ctx: any) => (void | boolean)): () => void;
    /**
     * Emits a before event. Returns false when cancelled.
     * @param {string} type
     * @param {any} payload
     * @param {any} ctx
     * @returns {boolean}
     */
    emitBefore(type: string, payload: any, ctx: any): boolean;
    /**
     * Emits an after event.
     * @param {string} type
     * @param {any} payload
     * @param {any} ctx
     */
    emitAfter(type: string, payload: any, ctx: any): void;
    /**
     * Returns a fluent API for registering hooks.
     * @param {'before'|'after'} phase
     */
    phase(phase: "before" | "after"): {
        /**
         * Registers a handler for a given type.
         * @param {string} type
         * @param {(payload: any, ctx: any) => (void|boolean)} fn
         */
        on(type: string, fn: (payload: any, ctx: any) => (void | boolean)): () => void;
        /**
         * Registers a handler for any type.
         * @param {(payload: any, ctx: any) => (void|boolean)} fn
         */
        any(fn: (payload: any, ctx: any) => (void | boolean)): () => void;
    };
    #private;
}
