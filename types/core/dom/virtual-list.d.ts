export function virtualList(items: any, options: any): VirtualListNode;
export class VirtualListNode extends Renderable {
    constructor(items: any, options?: {});
    mountInto(parent: any, beforeNode: any): void;
    renderToString(render: any): any;
    #private;
}
import { Renderable } from '../renderable/renderable.js';
