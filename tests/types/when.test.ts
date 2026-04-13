import { Div, Span, signal, state, when } from '@granularjs/core';

const enabled = signal(true);
const store = state({ ready: true });

const rawBranch = when('ok', () => Span('yes'), () => Span('no'));
const stateBranch = when(store.ready, () => Div('ready'), () => Div('not-ready'));
const fnBranch = when(() => enabled.get() && store.ready.get(), () => Div('go'));

Div(rawBranch, stateBranch, fnBranch);
