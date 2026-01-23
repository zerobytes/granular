import { Renderable } from '../renderable/renderable.js';
import { Renderer } from '../renderable/renderer.js';
import { isObservableArray } from '../collections/observable-array.js';
import { isSignal, readSignal, subscribeSignal } from '../reactivity/signal.js';
import { isState, isStatePath, readState, subscribeState } from '../reactivity/state.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isNumber(value) {
  return typeof value === 'number' && !Number.isNaN(value);
}

export class VirtualListNode extends Renderable {
  #items;
  #renderItem;
  #direction;
  #overscan;
  #itemSize;
  #container = null;
  #spacer = null;
  #itemsEl = null;
  #mounted = false;
  #unsub = null;
  #resizeObserver = null;
  #viewportSize = 0;
  #startIndex = 0;
  #endIndex = -1;
  #mountedValues = [];
  #measuring = false;

  constructor(items, options = {}) {
    super();
    this.#items = items;
    this.#renderItem = options.render;
    this.#direction = options.direction === 'horizontal' ? 'horizontal' : 'vertical';
    this.#overscan = isNumber(options.overscan) ? Math.max(0, options.overscan) : 2;
    this.#itemSize = isNumber(options.itemSize) ? options.itemSize : null;
  }

  mountInto(parent, beforeNode) {
    if (this.#mounted) return;
    if (typeof this.#renderItem !== 'function') {
      throw new Error('virtualList(items, options): options.render is required');
    }
    this.#mounted = true;

    const container = document.createElement('div');
    container.style.position = 'relative';
    container.style.overflow = 'auto';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.contain = 'layout paint';

    const spacer = document.createElement('div');
    spacer.style.position = 'relative';
    spacer.style.width = this.#direction === 'horizontal' ? '0px' : '100%';
    spacer.style.height = this.#direction === 'horizontal' ? '100%' : '0px';

    const itemsEl = document.createElement('div');
    itemsEl.style.position = 'absolute';
    itemsEl.style.top = '0';
    itemsEl.style.left = '0';
    itemsEl.style.willChange = 'transform';
    if (this.#direction === 'horizontal') {
      itemsEl.style.display = 'flex';
      itemsEl.style.flexDirection = 'row';
    }

    container.appendChild(spacer);
    container.appendChild(itemsEl);
    parent.insertBefore(container, beforeNode);

    this.#container = container;
    this.#spacer = spacer;
    this.#itemsEl = itemsEl;

    container.addEventListener('scroll', this.#onScroll);
    this.#observeResize(parent);
    this.#updateViewport(parent);
    this.#render();
    this.#wire();
  }

  unmount() {
    if (!this.#mounted) return;
    this.#mounted = false;
    if (this.#unsub) this.#unsub();
    this.#unsub = null;
    if (this.#container) {
      this.#container.removeEventListener('scroll', this.#onScroll);
    }
    if (this.#resizeObserver) {
      this.#resizeObserver.disconnect();
      this.#resizeObserver = null;
    }
    this.#cleanup();
    this.#container?.remove();
    this.#container = null;
    this.#spacer = null;
    this.#itemsEl = null;
  }

  #readItems() {
    if (isObservableArray(this.#items)) return this.#items;
    if (isSignal(this.#items)) return readSignal(this.#items) || [];
    if (isState(this.#items) || isStatePath(this.#items)) return readState(this.#items) || [];
    return Array.isArray(this.#items) ? this.#items : [];
  }

  #wire() {
    if (isObservableArray(this.#items)) {
      this.#unsub = this.#items.subscribe(() => this.#render());
      return;
    }
    if (isSignal(this.#items)) {
      this.#unsub = subscribeSignal(this.#items, () => this.#render());
      return;
    }
    if (isState(this.#items) || isStatePath(this.#items)) {
      this.#unsub = subscribeState(this.#items, () => this.#render());
    }
  }

  #observeResize(parent) {
    if (typeof ResizeObserver === 'undefined') return;
    this.#resizeObserver = new ResizeObserver(() => {
      this.#updateViewport(parent);
      this.#render();
    });
    this.#resizeObserver.observe(parent);
  }

  #updateViewport(parent) {
    const rect = parent?.getBoundingClientRect?.();
    if (!rect) return;
    this.#viewportSize = this.#direction === 'horizontal' ? rect.width : rect.height;
  }

  #measureItemSize() {
    if (this.#itemSize != null) return;
    if (!this.#itemsEl) return;
    const first = this.#itemsEl.firstElementChild;
    if (!first) return;
    const rect = first.getBoundingClientRect();
    const size = this.#direction === 'horizontal' ? rect.width : rect.height;
    if (isNumber(size) && size > 0) this.#itemSize = size;
  }

  #cleanup() {
    for (const r of this.#mountedValues) Renderer.unmount(r);
    this.#mountedValues = [];
    if (this.#itemsEl) this.#itemsEl.replaceChildren();
  }

  #renderRange(items, start, end, offset) {
    if (!this.#itemsEl) return;
    this.#cleanup();
    const slice = items.slice(start, end + 1);
    const values = [];
    for (let i = 0; i < slice.length; i++) {
      const index = start + i;
      const value = this.#renderItem(slice[i], index);
      const normalized = Renderer.normalize(value);
      for (const r of normalized) values.push(r);
    }
    this.#mountedValues = values;
    for (const r of values) {
      if (Renderer.isRenderable(r)) {
        r.mountInto(this.#itemsEl, null);
      } else if (Renderer.isDomNode(r)) {
        this.#itemsEl.appendChild(r);
      }
    }
    if (this.#direction === 'horizontal') {
      this.#itemsEl.style.transform = `translateX(${offset}px)`;
    } else {
      this.#itemsEl.style.transform = `translateY(${offset}px)`;
    }
  }

  #render() {
    if (!this.#mounted || !this.#container) return;
    const items = this.#readItems();
    const count = items.length;
    if (!this.#spacer) return;

    if (count === 0) {
      this.#spacer.style.width = this.#direction === 'horizontal' ? '0px' : '100%';
      this.#spacer.style.height = this.#direction === 'horizontal' ? '100%' : '0px';
      this.#cleanup();
      return;
    }

    if (this.#itemSize == null && !this.#measuring) {
      this.#measuring = true;
      this.#renderRange(items, 0, 0, 0);
      requestAnimationFrame(() => {
        this.#measureItemSize();
        this.#measuring = false;
        this.#render();
      });
      return;
    }

    const size = this.#itemSize || 1;
    const viewport = this.#viewportSize || (this.#direction === 'horizontal' ? this.#container.clientWidth : this.#container.clientHeight);
    const scrollPos = this.#direction === 'horizontal' ? this.#container.scrollLeft : this.#container.scrollTop;
    const visibleCount = Math.ceil(viewport / size);
    const start = clamp(Math.floor(scrollPos / size) - this.#overscan, 0, Math.max(0, count - 1));
    const end = clamp(start + visibleCount + this.#overscan * 2 - 1, 0, count - 1);
    const offset = start * size;

    const total = count * size;
    if (this.#direction === 'horizontal') {
      this.#spacer.style.width = `${total}px`;
      this.#spacer.style.height = '100%';
    } else {
      this.#spacer.style.height = `${total}px`;
      this.#spacer.style.width = '100%';
    }

    if (start === this.#startIndex && end === this.#endIndex) return;
    this.#startIndex = start;
    this.#endIndex = end;
    this.#renderRange(items, start, end, offset);
  }

  #onScroll = () => {
    this.#render();
  };

  renderToString(render) {
    const items = this.#readItems();
    return items.map((item, index) => render(this.#renderItem(item, index))).join('');
  }
}

export function virtualList(items, options) {
  return new VirtualListNode(items, options);
}
