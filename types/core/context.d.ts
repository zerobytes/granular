/**
 * Creates a context for sharing reactive state across a component tree
 * without prop drilling.
 *
 * Returns { serve, get, set }:
 * - serve(renderable, value?) — wraps a renderable as a context provider.
 * - get() — returns a reactive state bound to the nearest ancestor provider.
 * - set(value) — shortcut to update pending consumers' value.
 *
 * Usage:
 *   const sizeCtx = context([1, 2, 3]);
 *
 *   const Parent = (...children) =>
 *     sizeCtx.serve(Div(...children));
 *
 *   const Child = () => {
 *     const sizes = sizeCtx.get();
 *     return Div(sizes[0]);
 *   };
 *
 *   Parent(Child());
 */
export function context(defaultValue: any): {
    serve: (renderable: any, value: any) => ContextProvider;
    get: () => {};
    set: (value: any) => void;
};
declare class ContextProvider extends Renderable {
    constructor(child: any, providerSignal: any, consumers: any);
    mountInto(parent: any, beforeNode: any): void;
    renderToString(render: any): any;
    #private;
}
import { Renderable } from './renderable/renderable.js';
export {};
