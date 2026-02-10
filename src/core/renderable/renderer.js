import { Renderable } from './renderable.js';
import { isSignal, readSignal, subscribeSignal } from '../reactivity/signal.js';
import { isState, isStatePath, isComputed, readState, subscribeState } from '../reactivity/state.js';

class ReactiveTextNode extends Renderable {
  #source;
  #node = null;
  #mounted = false;
  #unsub = null;

  constructor(source) {
    super();
    this.#source = source;
  }

  mountInto(parent, beforeNode) {
    if (this.#mounted) return;
    this.#mounted = true;
    this.#node = document.createTextNode('');
    parent.insertBefore(this.#node, beforeNode);
    this.#sync();
    this.#wire();
  }

  unmount() {
    if (!this.#mounted) return;
    this.#mounted = false;
    if (this.#unsub) this.#unsub();
    this.#unsub = null;
    if (this.#node && this.#node.parentNode) this.#node.remove();
    this.#node = null;
  }

  #read() {
    const s = this.#source;
    if (isState(s) || isStatePath(s) || isComputed(s)) return readState(s);
    if (isSignal(s)) return readSignal(s);
    return s;
  }

  #wire() {
    const s = this.#source;
    if (isState(s) || isStatePath(s) || isComputed(s)) {
      this.#unsub = subscribeState(s, () => this.#sync());
      return;
    }
    if (isSignal(s)) {
      this.#unsub = subscribeSignal(s, () => this.#sync());
    }
  }

  #sync() {
    if (!this.#node) return;
    this.#node.textContent = Renderer.toText(this.#read());
  }

  renderToString() {
    return Renderer.toText(this.#read());
  }
}

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
   * - ReactiveTextNode for reactive values (state, signal, statePath, computed)
   * - TextNodes created from primitives/objects
   *
   * @param {unknown} value
   * @returns {(Renderable|Node)[]}
   */
  static normalize(value) {
    if (value == null || value === false) return [];
    if (Array.isArray(value)) return value.flatMap((v) => Renderer.normalize(v));
    if (Renderer.isRenderable(value) || Renderer.isDomNode(value)) return /** @type {(Renderable|Node)[]} */ ([value]);
    if (isSignal(value) || isState(value) || isStatePath(value) || isComputed(value)) return [new ReactiveTextNode(value)];
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

