import { Div, Span, match, signal, state } from '@granularjs/core';

const status = state('a');
const age = signal(20);

const single = match(status, (value) => value === 'a', () => Span('ok'));
const multiple = match([status, age, 'admin'] as const, (nextStatus, nextAge, role) => {
  return nextStatus === 'a' && nextAge > 18 && role === 'admin';
}, () => Div(status, age));

Div(single, multiple);
