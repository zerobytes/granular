/**
 * Creates a comment node used as a stable DOM anchor.
 * @param {string} label
 * @param {string} name
 */
export function createComment(label, name) {
  return document.createComment(`${label}:${name}`);
}

/**
 * Creates a single anchor comment node for a dynamic section.
 * Items are inserted BEFORE this anchor. The anchor stays in place
 * even when the section is empty, providing a stable insertion point.
 * @param {string} label
 * @returns {Comment}
 */
export function createAnchor(label) {
  return document.createComment(`g:a:${label}`);
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

/**
 * Removes a list of DOM nodes from their parent.
 * @param {Node[]} nodes
 */
export function removeNodes(nodes) {
  for (let i = 0; i < nodes.length; i++) nodes[i].remove();
}

/**
 * Collects all DOM nodes between two markers (exclusive).
 * @param {Node} start
 * @param {Node} end
 * @returns {Node[]}
 */
export function nodesBetween(start, end) {
  const result = [];
  let current = start.nextSibling;
  while (current && current !== end) {
    result.push(current);
    current = current.nextSibling;
  }
  return result;
}