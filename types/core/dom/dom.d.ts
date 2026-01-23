/**
 * Creates a comment node used as a stable DOM anchor.
 * @param {string} label
 * @param {string} name
 */
export function createComment(label: string, name: string): Comment;
/**
 * Removes all sibling nodes between two anchors.
 * @param {Comment} start
 * @param {Comment} end
 * @param {(node: Node) => void} [disposer]
 */
export function clearBetween(start: Comment, end: Comment, disposer?: (node: Node) => void): void;
