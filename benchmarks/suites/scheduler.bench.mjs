import { bench } from '../runner.mjs';
import { scheduler } from '../../src/index.js';
import { FLUSH_HOOK } from '../../src/core/reactivity/scheduler.js';

class FakeHost {
  constructor() { this.flushed = 0; }
  [FLUSH_HOOK]() { this.flushed++; }
}

bench('scheduler: schedule 1k hosts and flush', async () => {
  const hosts = Array.from({ length: 1000 }, () => new FakeHost());
  for (const h of hosts) scheduler.schedule(h);
  await Promise.resolve();
  await Promise.resolve();
}, { iterations: 100 });

bench('scheduler: schedule same host 1k times (dedupe)', async () => {
  const h = new FakeHost();
  for (let i = 0; i < 1000; i++) scheduler.schedule(h);
  await Promise.resolve();
  await Promise.resolve();
}, { iterations: 200 });
