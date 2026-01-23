/**
 * Base contract for objects that can be mounted/unmounted by the core renderer.
 */
export class Renderable {
    /**
     * Mounts the instance into the DOM.
     * @param {Node} parent
     * @param {Node|null} beforeNode
     */
    mountInto(): void;
    /**
     * Unmounts and releases DOM/resources owned by the instance.
     */
    unmount(): void;
}
