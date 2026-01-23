export function when(source: any, renderTrue: any, renderFalse: any): WhenNode;
export class WhenNode extends Renderable {
    constructor(source: any, renderTrue: any, renderFalse: any);
    mountInto(parent: any, beforeNode: any): void;
    renderToString(render: any): any;
    #private;
}
import { Renderable } from '../renderable/renderable.js';
