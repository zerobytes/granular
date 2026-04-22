let onCoerce = null;
let onUntrackedRead = null;

export function setDevHooks(hooks) {
  onCoerce = hooks?.onCoerce ?? null;
  onUntrackedRead = hooks?.onUntrackedRead ?? null;
}

export function notifyCoerce(kind, source, hint) {
  if (onCoerce) onCoerce(kind, source, hint);
}

export function notifyUntrackedRead(source, path) {
  if (onUntrackedRead) onUntrackedRead(source, path);
}

export function devHooksEnabled() {
  return onCoerce !== null || onUntrackedRead !== null;
}
