export function isObservableArray(value: any): boolean;
export function observableArray(initial?: any[]): any[];
export type ObservableArrayPatchInsert = {
    type: "insert";
    index: number;
    items: any[];
};
export type ObservableArrayPatchRemove = {
    type: "remove";
    index: number;
    count: number;
    items: any[];
};
export type ObservableArrayPatchSet = {
    type: "set";
    index: number;
    value: any;
    prev: any;
};
export type ObservableArrayPatchReset = {
    type: "reset";
    items: any[];
    prevItems: any[];
};
export type ObservableArrayPatch = ObservableArrayPatchInsert | ObservableArrayPatchRemove | ObservableArrayPatchSet | ObservableArrayPatchReset;
