/**
 * Base contract for objects that can be mounted/unmounted by the core renderer.
 */
export class Renderable {
  /**
   * Mounts the instance into the DOM.
   * @param {Node} parent
   * @param {Node|null} beforeNode
   */
  mountInto() {
    throw new Error('Renderable.mountInto() must be implemented');
  }

  /**
   * Unmounts and releases DOM/resources owned by the instance.
   */
  unmount() {
    throw new Error('Renderable.unmount() must be implemented');
  }
}

