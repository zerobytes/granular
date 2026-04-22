# Granular Benchmarks

Formal performance suite covering signal, state, scheduler and keyed list reconciliation.

## Run

```bash
npm run bench                  # run all suites
npm run bench -- --filter signal  # filter by name substring
npm run bench:baseline         # save current numbers as baseline
npm run bench:check            # compare current run to baseline.json
```

## Regression gate

`bench:check` fails (`exit 2`) if any benchmark median exceeds the baseline by
the configured `--threshold` (default 20%). Use this as a CI gate on PRs.

## Adding suites

Drop a `*.bench.mjs` file into `benchmarks/suites/` and register cases:

```js
import { bench } from '../runner.mjs';
import { signal } from '../../src/index.js';

bench('signal: my workload', () => {
  const s = signal(0);
  for (let i = 0; i < 100; i++) s.set(i);
}, { iterations: 200 });
```

Each case runs a small warmup, then `iterations` operations split into 5 samples;
the runner reports min / median / mean / max latencies and ops/sec.

## Output format

JSON output (`--out path.json`) is stable and contains:

```json
{
  "timestamp": "...",
  "node": "v20.x.x",
  "platform": "linux",
  "results": [
    { "name": "...", "median": 0.123, "opsPerSec": 8130, ... }
  ]
}
```
