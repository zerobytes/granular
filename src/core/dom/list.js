import { Renderable } from '../renderable/renderable.js';
import { Renderer } from '../renderable/renderer.js';
import { isObservableArray } from '../collections/observable-array.js';
import { createAnchor } from './dom.js';
import { signal, setSignal, isSignal, readSignal, subscribeSignal } from '../reactivity/signal.js';
import { state, isState, isStatePath, readState, subscribeState } from '../reactivity/state.js';
import { after } from '../reactivity/observe.js';

function longestIncreasingSubsequence(arr) {
  if (arr.length === 0) return [];
  const tails = [];
  const tailsIdx = [];
  const prev = new Array(arr.length).fill(-1);

  for (let i = 0; i < arr.length; i++) {
    const x = arr[i];
    if (x === -1) continue;
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = x;
    tailsIdx[lo] = i;
    prev[i] = lo > 0 ? tailsIdx[lo - 1] : -1;
  }

  const result = new Array(tails.length);
  let k = tails.length - 1;
  let cursor = tailsIdx[k];
  while (k >= 0 && cursor !== -1) {
    result[k--] = cursor;
    cursor = prev[cursor];
  }
  return result;
}

export class ListNode extends Renderable {
  #items;
  #renderItem;
  #key;
  #anchor = null;
  #mounted = false;
  #unsub = null;
  #itemRefs = [];
  nodeType = 'granular-list-node'

  constructor(items, renderItem, options = {}) {
    super();
    this.#items = items;
    this.#renderItem = renderItem;
    this.#key = typeof options?.key === 'function' ? options.key : null;
  }

  #isStateSource() {
    return isState(this.#items) || isStatePath(this.#items);
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
    if (this.#isStateSource()) return readState(this.#items) || [];
    return Array.isArray(this.#items) ? this.#items : [];
  }

  #createItemState(index, item) {
    // For keyed mode we cannot use the path-based sub-state of the parent
    // (paths are positional but keys are content-based, so a moved row would
    // keep listening to the wrong path and a content swap would recurse
    // through the parent state's subscriber). Always use an independent
    // local state for keyed lists.
    if (this.#isStateSource() && !this.#key) return this.#items[String(index)];
    return state(item);
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

    if (this.#isStateSource()) {
      let scheduled = false;
      this.#unsub = subscribeState(this.#items, () => {
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(() => {
          scheduled = false;
          if (!this.#mounted) return;
          const next = readState(this.#items);
          this.#reset(Array.isArray(next) ? next : []);
        });
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
    if (this.#key && this.#itemRefs.length > 0) {
      this.#reconcileKeyed(items);
      return;
    }
    if (items.length === this.#itemRefs.length) {
      // For state sources without a key, sub-state proxies path-track
      // automatically — calling .set() would recurse through the parent
      // state's subscriber.
      const skipSet = this.#isStateSource();
      if (!skipSet) {
        for (let i = 0; i < items.length; i++) {
          const ref = this.#itemRefs[i];
          if (ref?.state) ref.state.set(items[i]);
        }
      }
      return;
    }
    this.#cleanup();
    this.#mountAll(items);
  }

  #reconcileKeyed(nextItems) {
    const oldByKey = new Map();
    for (let i = 0; i < this.#itemRefs.length; i++) {
      const ref = this.#itemRefs[i];
      oldByKey.set(ref.key, { ref, oldIndex: i });
    }

    const nextRefs = new Array(nextItems.length);
    const oldIndexes = new Array(nextItems.length);
    const reusedKeys = new Set();

    for (let i = 0; i < nextItems.length; i++) {
      const item = nextItems[i];
      const key = this.#key(item, i);
      const existing = oldByKey.get(key);
      if (existing) {
        existing.ref.state?.set(item);
        nextRefs[i] = existing.ref;
        oldIndexes[i] = existing.oldIndex;
        reusedKeys.add(key);
      } else {
        nextRefs[i] = null;
        oldIndexes[i] = -1;
      }
    }

    for (const ref of this.#itemRefs) {
      if (!reusedKeys.has(ref.key)) {
        if (ref.syncUnsub) ref.syncUnsub();
        for (const r of ref.renderables) Renderer.unmount(r);
        for (const n of ref.nodes) if (n.parentNode) n.remove();
      }
    }

    const lis = new Set(longestIncreasingSubsequence(oldIndexes));
    const parent = this.#anchor.parentNode;

    for (let i = nextItems.length - 1; i >= 0; i--) {
      const refNode = i + 1 < nextRefs.length
        ? this.#firstNodeOfRef(nextRefs[i + 1])
        : this.#anchor;

      if (nextRefs[i] === null) {
        const item = nextItems[i];
        const key = this.#key(item, i);
        nextRefs[i] = this.#createRef(i, item, key);
        this.#mountRefBefore(nextRefs[i], parent, refNode);
      } else if (!lis.has(i)) {
        for (const n of nextRefs[i].nodes) parent.insertBefore(n, refNode);
      }
    }

    this.#itemRefs = nextRefs;
    for (let i = 0; i < this.#itemRefs.length; i++) {
      const ref = this.#itemRefs[i];
      if (ref.index) setSignal(ref.index, i);
    }
  }

  #firstNodeOfRef(ref) {
    if (!ref || !ref.nodes.length) return this.#anchor;
    return ref.nodes[0];
  }

  #createRef(index, item, key) {
    const itemState = this.#createItemState(index, item);
    const indexSignal = signal(index);
    const rendered = this.#renderItem ? this.#renderItem(itemState, indexSignal) : item;
    const renderables = Renderer.normalize(rendered);
    return { nodes: [], renderables, state: itemState, index: indexSignal, key };
  }

  #mountRefBefore(ref, parent, refNode) {
    const marker = document.createTextNode('');
    parent.insertBefore(marker, refNode);
    for (const r of ref.renderables) {
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
    ref.nodes = nodes;
    this.#wireSyncToObservableArray(ref);
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

    const itemState = this.#createItemState(index, item);
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

    const ref = {
      nodes,
      renderables,
      state: itemState,
      index: indexSignal,
      key: this.#key ? this.#key(item, index) : null,
    };
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
      const itemState = this.#createItemState(idx, item);
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
      newRefs.push({
        nodes,
        renderables,
        state: itemState,
        index: indexSignal,
        key: this.#key ? this.#key(item, idx) : null,
      });
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

export function list(items, renderItem, options) {
  return new ListNode(items, renderItem, options);
}
