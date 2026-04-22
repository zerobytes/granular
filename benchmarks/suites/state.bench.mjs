import { bench } from '../runner.mjs';
import { state, after } from '../../src/index.js';

bench('state: create deep object', () => {
  const s = state({ user: { name: 'a', profile: { age: 1, tags: ['x', 'y'] } } });
  s.user.profile.age;
}, { iterations: 500 });

bench('state: 1k path writes', () => {
  const s = state({ counter: 0, list: [] });
  for (let i = 0; i < 1000; i++) s.set('counter', i);
}, { iterations: 50 });

bench('state: subscribe to 5 paths, write each 200x', () => {
  const s = state({ a: 0, b: 0, c: 0, d: 0, e: 0 });
  for (const k of ['a', 'b', 'c', 'd', 'e']) {
    after(s[k]).change(() => {});
  }
  for (let i = 0; i < 200; i++) {
    s.set('a', i); s.set('b', i); s.set('c', i); s.set('d', i); s.set('e', i);
  }
}, { iterations: 50 });

bench('state: full set of root with deep tree', () => {
  const s = state({ items: new Array(50).fill(0).map((_, i) => ({ id: i, value: i })) });
  for (let i = 0; i < 100; i++) {
    s.set({ items: new Array(50).fill(0).map((_, idx) => ({ id: idx, value: idx + i })) });
  }
}, { iterations: 50 });
