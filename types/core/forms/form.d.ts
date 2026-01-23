export function form(initial: any): {
    values: {};
    meta: {};
    errors: {};
    touched: {};
    dirty: {};
    validators: Set<any>;
    reset: () => void;
};
