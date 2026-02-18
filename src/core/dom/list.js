import { Renderable } from '../renderable/renderable.js';
import { Renderer } from '../renderable/renderer.js';
import { isObservableArray } from '../collections/observable-array.js';
import { createAnchor } from './dom.js';
import { signal, setSignal, isSignal, readSignal, subscribeSignal } from '../reactivity/signal.js';
import { state, isState, isStatePath, readState, subscribeState } from '../reactivity/state.js';
import { after } from '../reactivity/observe.js';

export class ListNode extends Renderable {
  #items;
  #renderItem;
  #anchor = null;
  #mounted = false;
  #unsub = null;
  #itemRefs = [];
  nodeType = 'granular-list-node'

  constructor(items, renderItem) {
    super();
    this.#items = items;
    this.#renderItem = renderItem;
  }

  mountInto(parent, beforeNode) {
    if (this.#mounted) return;
    this.#mounted = true;
    this.#anchor = createAnchor('list');
    parent.insertBefore(this.#anchor, beforeNode);

    const initial = this.#readItems();
    this.#mountAll(initial);
    this.#wire();
  }

  unmount() {
    if (!this.#mounted) return;
    this.#mounted = false;
    if (this.#unsub) this.#unsub();
    this.#unsub = null;
    this.#cleanup();
    if (this.#anchor) {
      this.#anchor.remove();
      this.#anchor = null;
    }
  }

  renderToString(render) {
    const items = this.#readItems();
    return items.map((item, index) => {
      const itemState = state(item);
      const indexSignal = signal(index);
      return render(this.#renderItem(itemState, indexSignal));
    }).join('');
  }

  #readItems() {
    if (isObservableArray(this.#items)) return this.#items;
    if (isSignal(this.#items)) return readSignal(this.#items) || [];
    if (isState(this.#items) || isStatePath(this.#items)) return readState(this.#items) || [];
    return Array.isArray(this.#items) ? this.#items : [];
  }

  #wire() {
    if (isObservableArray(this.#items)) {
      this.#unsub = this.#items.subscribe((patch) => {
        if (!this.#mounted) return;
        if (patch.type === 'reset') {
          this.#reset(patch.items);
          return;
        }
        if (patch.type === 'insert') {
          if (patch.items.length > 1) {
            this.#insertBatch(patch.index, patch.items);
          } else if (patch.items.length === 1) {
            this.#insert(patch.index, patch.items[0]);
          }
          this.#updateIndices(patch.index + patch.items.length);
          return;
        }
        if (patch.type === 'remove') {
          this.#remove(patch.index, patch.count);
          this.#updateIndices(patch.index);
          return;
        }
        if (patch.type === 'set') {
          this.#set(patch.index, patch.value);
        }
      });
      return;
    }

    if (isSignal(this.#items)) {
      this.#unsub = subscribeSignal(this.#items, () => {
        this.#reset(this.#readItems());
      });
      return;
    }

    if (isState(this.#items) || isStatePath(this.#items)) {
      this.#unsub = subscribeState(this.#items, () => {
        this.#reset(this.#readItems());
      });
    }
  }

  #mountAll(items) {
    this.#itemRefs = [];
    for (let i = 0; i < items.length; i++) {
      this.#insert(i, items[i]);
    }
  }

  #cleanup() {
    for (const it of this.#itemRefs) {
      if (it.syncUnsub) it.syncUnsub();
      for (const r of it.renderables) Renderer.unmount(r);
      for (const n of it.nodes) if (n.parentNode) n.remove();
    }
    this.#itemRefs = [];
  }

  #wireSyncToObservableArray(ref) {
    if (!isObservableArray(this.#items)) return;
    ref.syncUnsub = after(ref.state).change((next) => {
      const i = readSignal(ref.index);
      if (this.#itemRefs[i] !== ref) return;
      if (this.#items[i] === next) return;
      this.#items[i] = next;
    });
  }

  #reset(items) {
    if (items.length === this.#itemRefs.length) {
      for (let i = 0; i < items.length; i++) {
        const ref = this.#itemRefs[i];
        if (ref?.state) ref.state.set(items[i]);
      }
      return;
    }
    this.#cleanup();
    this.#mountAll(items);
  }

  #refNodeAt(index) {
    for (let i = index; i < this.#itemRefs.length; i++) {
      if (this.#itemRefs[i].nodes.length) return this.#itemRefs[i].nodes[0];
    }
    return this.#anchor;
  }

  #insert(index, item) {
    const refNode = this.#refNodeAt(index);
    const parent = this.#anchor.parentNode;

    const marker = document.createTextNode('');
    parent.insertBefore(marker, refNode);

    const itemState = state(item);
    const indexSignal = signal(index);
    const rendered = this.#renderItem ? this.#renderItem(itemState, indexSignal) : item;
    const renderables = Renderer.normalize(rendered);

    for (const r of renderables) {
      if (Renderer.isRenderable(r)) {
        r.mountInto(parent, refNode);
      } else if (Renderer.isDomNode(r)) {
        parent.insertBefore(r, refNode);
      }
    }

    const nodes = [];
    let cur = marker.nextSibling;
    while (cur && cur !== refNode) {
      nodes.push(cur);
      cur = cur.nextSibling;
    }
    marker.remove();

    const ref = { nodes, renderables, state: itemState, index: indexSignal };
    this.#itemRefs.splice(index, 0, ref);
    this.#wireSyncToObservableArray(ref);
  }

  #insertBatch(index, items) {
    const refNode = this.#refNodeAt(index);
    const parent = this.#anchor.parentNode;
    const fragment = document.createDocumentFragment();
    const newRefs = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const idx = index + i;
      const itemState = state(item);
      const indexSignal = signal(idx);
      const rendered = this.#renderItem ? this.#renderItem(itemState, indexSignal) : item;
      const renderables = Renderer.normalize(rendered);

      const startLen = fragment.childNodes.length;
      for (const r of renderables) {
        if (Renderer.isRenderable(r)) {
          r.mountInto(fragment, null);
        } else if (Renderer.isDomNode(r)) {
          fragment.appendChild(r);
        }
      }
      const nodes = [];
      for (let j = startLen; j < fragment.childNodes.length; j++) {
        nodes.push(fragment.childNodes[j]);
      }
      newRefs.push({ nodes, renderables, state: itemState, index: indexSignal });
    }

    parent.insertBefore(fragment, refNode);
    this.#itemRefs.splice(index, 0, ...newRefs);
    for (const ref of newRefs) this.#wireSyncToObservableArray(ref);
  }

  #remove(index, count) {
    const removed = this.#itemRefs.splice(index, count);
    for (const it of removed) {
      if (it.syncUnsub) it.syncUnsub();
      for (const r of it.renderables) Renderer.unmount(r);
      for (const n of it.nodes) if (n.parentNode) n.remove();
    }
  }

  #set(index, item) {
    const ref = this.#itemRefs[index];
    if (ref && ref.state) {
      ref.state.set(item);
      return;
    }
    this.#remove(index, 1);
    this.#insert(index, item);
  }

  #updateIndices(fromIndex) {
    for (let i = fromIndex; i < this.#itemRefs.length; i++) {
      const ref = this.#itemRefs[i];
      if (ref.index) setSignal(ref.index, i);
    }
  }
}

export function list(items, renderItem) {
  return new ListNode(items, renderItem);
}
