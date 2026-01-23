export function portal(target: any, content: any): PortalNode;
export class PortalNode extends Renderable {
    constructor(target: any, content: any);
    mountInto(_parent: any, _beforeNode: any): void;
    renderToString(render: any): any;
    #private;
}
import { Renderable } from '../renderable/renderable.js';
