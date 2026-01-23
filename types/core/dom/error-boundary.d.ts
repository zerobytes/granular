export function ErrorBoundary(options: any, child: any): ErrorBoundaryNode;
export class ErrorBoundaryNode extends Renderable {
    constructor(options: any, child: any);
    mountInto(parent: any, beforeNode: any): void;
    renderToString(render: any): any;
    #private;
}
import { Renderable } from '../renderable/renderable.js';
