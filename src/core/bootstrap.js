import { Renderer } from './renderable/renderer.js';

/**
 * Creates and attaches a component instance or render function to a target element.
 *
 * @template T
 * @param {new (...args: any[]) => T | (() => any)} ComponentClass
 * @param {string|Element} target
 * @returns {Promise<T|{ unmount(): void }>}
 */
export async function bootstrap(ComponentClass, target) {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) throw new Error('bootstrap target not found');
  el.textContent = '';

  if (typeof ComponentClass !== 'function') {
    throw new Error('bootstrap: component must be a function or class');
  }

  let instance = null;
  try {
    instance = new ComponentClass(el);
  } catch {
    instance = null;
  }

  if (instance) {
    if (typeof instance.attach === 'function') {
      await instance.attach(el);
      return instance;
    }
    if (typeof instance.mountInto === 'function') {
      instance.mountInto(el, null);
      return instance;
    }
  }

  const root = ComponentClass(el);
  if (root === undefined || root === null) {
    return {
      unmount() {},
    };
  }
  const values = Renderer.normalize(root);
  for (const r of values) {
    if (Renderer.isRenderable(r)) {
      r.mountInto(el, null);
    } else if (Renderer.isDomNode(r)) {
      el.appendChild(r);
    }
  }

  return {
    unmount() {
      for (const r of values) {
        if (Renderer.isRenderable(r)) {
          r.unmount();
        } else if (Renderer.isDomNode(r)) {
          r.remove();
        }
      }
    },
  };
}

