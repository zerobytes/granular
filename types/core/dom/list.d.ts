export function list(items: any, renderItem: any): ListNode;
export class ListNode extends Renderable {
    constructor(items: any, renderItem: any);
    nodeType: string;
    mountInto(parent: any, beforeNode: any): void;
    renderToString(render: any): any;
    #private;
}
import { Renderable } from '../renderable/renderable.js';
