export function createWebSocket(options: any): WebSocketClient;
export class WebSocketClient {
    constructor(options?: {});
    state(): {};
    before(): {
        on(type: string, fn: (payload: any, ctx: any) => (void | boolean)): () => void;
        any(fn: (payload: any, ctx: any) => (void | boolean)): () => void;
    };
    after(): {
        on(type: string, fn: (payload: any, ctx: any) => (void | boolean)): () => void;
        any(fn: (payload: any, ctx: any) => (void | boolean)): () => void;
    };
    setUrl(next: any): void;
    connect(): void;
    send(value: any): void;
    close(code: any, reason: any): void;
    #private;
}
