import { Renderable } from './renderable.js';

/**
 * Core rendering rules for "values".
 * This is intentionally separate from the Renderable contract.
 */
export class Renderer {
  /**
   * @param {unknown} value
   * @returns {value is Node}
   */
  static isDomNode(value) {
    return !!value && typeof value === 'object' && typeof value.nodeType === 'number';
  }

  /**
   * @param {unknown} value
   * @returns {value is Renderable}
   */
  static isRenderable(value) {
    return value instanceof Renderable;
  }

  /**
   * Converts a non-renderable value into string for text rendering.
   * @param {unknown} value
   * @returns {string}
   */
  static toText(value) {
    if (value == null || value === false) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'bigint') return String(value);
    if (typeof value === 'boolean') return value ? 'true' : '';
    try {
      return String(value);
    } catch {
      return '';
    }
  }

  /**
   * Normalizes a value into a flat list of renderables:
   * - Renderable instances
   * - DOM Nodes
   * - TextNodes created from primitives/objects
   *
   * @param {unknown} value
   * @returns {(Renderable|Node)[]}
   */
  static normalize(value) {
    if (value == null || value === false) return [];
    if (Array.isArray(value)) return value.flatMap((v) => Renderer.normalize(v));
    if (Renderer.isRenderable(value) || Renderer.isDomNode(value)) return /** @type {(Renderable|Node)[]} */ ([value]);
    return [document.createTextNode(Renderer.toText(value))];
  }

  /**
   * Unmounts a renderable value if applicable.
   * @param {unknown} value
   */
  static unmount(value) {
    if (Renderer.isRenderable(value)) value.unmount();
  }
}

