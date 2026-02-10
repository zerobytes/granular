/**
 * Core rendering rules for "values".
 * This is intentionally separate from the Renderable contract.
 */
export class Renderer {
    /**
     * @param {unknown} value
     * @returns {value is Node}
     */
    static isDomNode(value: unknown): value is Node;
    /**
     * @param {unknown} value
     * @returns {value is Renderable}
     */
    static isRenderable(value: unknown): value is Renderable;
    /**
     * Converts a non-renderable value into string for text rendering.
     * @param {unknown} value
     * @returns {string}
     */
    static toText(value: unknown): string;
    /**
     * Normalizes a value into a flat list of renderables:
     * - Renderable instances
     * - DOM Nodes
     * - ReactiveTextNode for reactive values (state, signal, statePath, computed)
     * - TextNodes created from primitives/objects
     *
     * @param {unknown} value
     * @returns {(Renderable|Node)[]}
     */
    static normalize(value: unknown): (Renderable | Node)[];
    /**
     * Unmounts a renderable value if applicable.
     * @param {unknown} value
     */
    static unmount(value: unknown): void;
}
import { Renderable } from './renderable.js';
