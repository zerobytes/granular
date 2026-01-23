let scheduled = false;
const watchers = new Set();

function flush() {
  scheduled = false;
  for (const run of watchers) run();
}

export const AfterFlush = {
  schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(flush);
  },
  add(run) {
    watchers.add(run);
    return () => watchers.delete(run);
  },
};

