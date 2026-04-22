import { bench } from '../runner.mjs';
import { JSDOM } from 'jsdom';
import { state, list, Renderer } from '../../src/index.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.Text = dom.window.Text;

function mountList(items, key) {
  const root = document.createElement('div');
  const arr = state(items);
  const node = list(arr, (item) => {
    const el = document.createElement('span');
    el.textContent = String(item.id);
    return el;
  }, { key: (it) => it.id });
  Renderer.normalize(node).forEach((n) => n.mountInto(root, null));
  return { root, arr };
}

bench('list keyed: 100 items, reverse order 50x', async () => {
  const items = Array.from({ length: 100 }, (_, i) => ({ id: i }));
  const { arr } = mountList(items);
  for (let i = 0; i < 50; i++) {
    arr.set([...arr.get()].reverse());
    await Promise.resolve();
  }
}, { iterations: 30 });

bench('list keyed: 100 items, prepend 50x', async () => {
  const items = Array.from({ length: 100 }, (_, i) => ({ id: i }));
  const { arr } = mountList(items);
  let nextId = 1000;
  for (let i = 0; i < 50; i++) {
    arr.set([{ id: nextId++ }, ...arr.get()]);
    await Promise.resolve();
  }
}, { iterations: 30 });

bench('list keyed: 100 items, swap pairs 50x', async () => {
  const items = Array.from({ length: 100 }, (_, i) => ({ id: i }));
  const { arr } = mountList(items);
  for (let r = 0; r < 50; r++) {
    const next = [...arr.get()];
    for (let i = 0; i < next.length - 1; i += 2) {
      const tmp = next[i]; next[i] = next[i + 1]; next[i + 1] = tmp;
    }
    arr.set(next);
    await Promise.resolve();
  }
}, { iterations: 30 });
