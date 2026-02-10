/**
 * Creates a comment node used as a stable DOM anchor.
 * @param {string} label
 * @param {string} name
 */
export function createComment(label: string, name: string): Comment;
/**
 * Creates a single anchor comment node for a dynamic section.
 * Items are inserted BEFORE this anchor. The anchor stays in place
 * even when the section is empty, providing a stable insertion point.
 * @param {string} label
 * @returns {Comment}
 */
export function createAnchor(label: string): Comment;
/**
 * Removes all sibling nodes between two anchors.
 * @param {Comment} start
 * @param {Comment} end
 * @param {(node: Node) => void} [disposer]
 */
export function clearBetween(start: Comment, end: Comment, disposer?: (node: Node) => void): void;
/**
 * Removes a list of DOM nodes from their parent.
 * @param {Node[]} nodes
 */
export function removeNodes(nodes: Node[]): void;
/**
 * Collects all DOM nodes between two markers (exclusive).
 * @param {Node} start
 * @param {Node} end
 * @returns {Node[]}
 */
export function nodesBetween(start: Node, end: Node): Node[];
