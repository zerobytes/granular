import { bench } from '../runner.mjs';
import { signal, after } from '../../src/index.js';

bench('signal: create + read', () => {
  const s = signal(0);
  for (let i = 0; i < 100; i++) s.get();
}, { iterations: 200 });

bench('signal: write 1k updates', () => {
  const s = signal(0);
  for (let i = 0; i < 1000; i++) s.set(i);
}, { iterations: 100 });

bench('signal: write with 10 subscribers (1k updates)', () => {
  const s = signal(0);
  for (let i = 0; i < 10; i++) s.subscribe(() => {});
  for (let i = 0; i < 1000; i++) s.set(i);
}, { iterations: 100 });

bench('signal: after().compute() chain (1k updates)', async () => {
  const a = signal(0);
  const c = after(a).compute((v) => v * 2);
  let last = 0;
  c.subscribe((v) => { last = v; });
  for (let i = 0; i < 1000; i++) a.set(i);
  await Promise.resolve();
  return last;
}, { iterations: 50 });
