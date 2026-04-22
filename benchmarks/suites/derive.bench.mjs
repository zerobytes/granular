import { bench } from '../runner.mjs';
import { signal, state, after, derive } from '../../src/index.js';

// 1. simple binary computation: a*2 + b -----------------------------------

bench('derive: 2 deps create + initial read', () => {
  const a = signal(1);
  const b = signal(2);
  const d = derive(() => a.get() * 2 + b.get());
  return d.get();
}, { iterations: 5000 });

bench('after.compute: 2 deps create + initial read', () => {
  const a = signal(1);
  const b = signal(2);
  const c = after(a, b).compute(([av, bv]) => av * 2 + bv);
  return c.get();
}, { iterations: 5000 });

// 2. propagation: 1k updates with 2 dependencies --------------------------

bench('derive: 1k updates (2 deps)', async () => {
  const a = signal(0);
  const b = signal(0);
  const d = derive(() => a.get() + b.get());
  let last = 0;
  d.subscribe((v) => { last = v; });
  for (let i = 0; i < 1000; i++) a.set(i);
  await Promise.resolve();
  return last;
}, { iterations: 50 });

bench('after.compute: 1k updates (2 deps)', async () => {
  const a = signal(0);
  const b = signal(0);
  const c = after(a, b).compute(([av, bv]) => av + bv);
  let last = 0;
  c.subscribe((v) => { last = v; });
  for (let i = 0; i < 1000; i++) a.set(i);
  await Promise.resolve();
  return last;
}, { iterations: 50 });

// 3. dynamic deps (only derive can do this naturally) ---------------------

bench('derive: 1k updates with branchy deps', async () => {
  const flag = signal(false);
  const x = signal(1);
  const y = signal(2);
  const d = derive(() => (flag.get() ? y.get() : x.get()));
  let last = 0;
  d.subscribe((v) => { last = v; });
  for (let i = 0; i < 1000; i++) {
    flag.set(i % 2 === 0);
    x.set(i);
    y.set(i + 1);
  }
  await Promise.resolve();
  return last;
}, { iterations: 30 });

// 4. state path access (5 deps) -------------------------------------------

bench('derive: state subpaths (5 deps, 1k updates)', async () => {
  const s = state({ a: 1, b: 2, c: 3, d: 4, e: 5 });
  const d = derive(() => s.get('a') + s.get('b') + s.get('c') + s.get('d') + s.get('e'));
  let last = 0;
  d.subscribe((v) => { last = v; });
  for (let i = 0; i < 1000; i++) s.set('a', i);
  await Promise.resolve();
  return last;
}, { iterations: 30 });

bench('after.compute: state subpaths (5 deps, 1k updates)', async () => {
  const s = state({ a: 1, b: 2, c: 3, d: 4, e: 5 });
  const c = after(s.a, s.b, s.c, s.d, s.e).compute(([a, b, c, d, e]) => a + b + c + d + e);
  let last = 0;
  c.subscribe((v) => { last = v; });
  for (let i = 0; i < 1000; i++) s.set('a', i);
  await Promise.resolve();
  return last;
}, { iterations: 30 });
