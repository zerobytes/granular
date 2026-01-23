export namespace AfterFlush {
    function schedule(): void;
    function add(run: any): () => boolean;
}
