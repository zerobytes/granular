import { Renderable } from '../renderable/renderable.js';
import { Renderer } from '../renderable/renderer.js';
import { isObservableArray } from '../collections/observable-array.js';
import { createComment, clearBetween } from './dom.js';
import { signal, setSignal, isSignal, readSignal, subscribeSignal } from '../reactivity/signal.js';
import { state, isState, isStatePath, readState, subscribeState } from '../reactivity/state.js';

export class ListNode extends Renderable {
  #items;
  #renderItem;
  #start = null;
  #end = null;
  #mounted = false;
  #unsub = null;
  #itemRefs = [];

  constructor(items, renderItem) {
    super();
    this.#items = items;
    this.#renderItem = renderItem;
  }

  mountInto(parent, beforeNode) {
    if (this.#mounted) return;
    this.#mounted = true;
    this.#start = createComment('zb:list:start', 'list');
    this.#end = createComment('zb:list:end', 'list');
    parent.insertBefore(this.#start, beforeNode);
    parent.insertBefore(this.#end, beforeNode);

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
    if (this.#start && this.#end) {
      clearBetween(this.#start, this.#end);
      this.#start.remove();
      this.#end.remove();
    }
    this.#start = null;
    this.#end = null;
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
          for (let i = 0; i < patch.items.length; i++) {
            this.#insert(patch.index + i, patch.items[i]);
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
      for (const r of it.values) Renderer.unmount(r);
      clearBetween(it.start, it.end);
      it.start.remove();
      it.end.remove();
    }
    this.#itemRefs = [];
  }

  #reset(items) {
    this.#cleanup();
    this.#mountAll(items);
  }

  #insert(index, item) {
    const refNode = index < this.#itemRefs.length ? this.#itemRefs[index].start : this.#end;
    const itemStart = createComment('zb:item:start', 'item');
    const itemEnd = createComment('zb:item:end', 'item');
    const parent = this.#end.parentNode;
    parent.insertBefore(itemStart, refNode);
    parent.insertBefore(itemEnd, refNode);
    const itemState = state(item);
    const indexSignal = signal(index);
    const rendered = this.#renderItem ? this.#renderItem(itemState, indexSignal) : item;
    const values = Renderer.normalize(rendered);
    for (const r of values) this.#mountRenderable(parent, r, itemEnd);
    this.#itemRefs.splice(index, 0, { start: itemStart, end: itemEnd, values, state: itemState, index: indexSignal });
  }

  #remove(index, count) {
    const removed = this.#itemRefs.splice(index, count);
    for (const it of removed) {
      for (const r of it.values) Renderer.unmount(r);
      clearBetween(it.start, it.end);
      it.start.remove();
      it.end.remove();
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

  #mountRenderable(parent, renderable, beforeNode) {
    if (Renderer.isRenderable(renderable)) {
      renderable.mountInto(parent, beforeNode);
      return;
    }
    if (Renderer.isDomNode(renderable)) {
      parent.insertBefore(renderable, beforeNode);
    }
  }
}

export function list(items, renderItem) {
  return new ListNode(items, renderItem);
}
