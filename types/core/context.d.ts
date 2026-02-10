/**
 * Creates a context for sharing reactive state across a component tree
 * without prop drilling.
 *
 * Returns { scope, state }:
 * - scope(value?) — creates a new provider level. Returns a state with
 *     .get(), .set(), path access, and .serve(renderable) to wrap children.
 * - state() — returns a reactive state bound to the nearest ancestor provider.
 *
 * Usage:
 *   const sizeCtx = context([1, 2, 3]);
 *
 *   const Parent = (...children) => {
 *     const sizes = sizeCtx.scope();
 *     sizes.set([10, 20, 30]);
 *     return sizes.serve(Div(...children));
 *   };
 *
 *   const Child = () => {
 *     const sizes = sizeCtx.state();
 *     return Div(sizes[0]);
 *   };
 *
 *   Parent(Child());
 */
export function context(defaultValue: any): {
    scope: (value: any) => {};
    state: () => {};
};
