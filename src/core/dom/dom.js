/**
 * Creates a comment node used as a stable DOM anchor.
 * @param {string} label
 * @param {string} name
 */
export function createComment(label, name) {
  return document.createComment(`${label}:${name}`);
}

/**
 * Removes all sibling nodes between two anchors.
 * @param {Comment} start
 * @param {Comment} end
 * @param {(node: Node) => void} [disposer]
 */
export function clearBetween(start, end, disposer) {
  let current = start.nextSibling;
  while (current && current !== end) {
    const next = current.nextSibling;
    disposer?.(current);
    current.remove();
    current = next;
  }
}

