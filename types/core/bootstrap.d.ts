/**
 * Creates and attaches a component instance or render function to a target element.
 *
 * @template T
 * @param {new (...args: any[]) => T | (() => any)} ComponentClass
 * @param {string|Element} target
 * @returns {Promise<T|{ unmount(): void }>}
 */
export function bootstrap<T>(ComponentClass: new (...args: any[]) => T | (() => any), target: string | Element): Promise<T | {
    unmount(): void;
}>;
