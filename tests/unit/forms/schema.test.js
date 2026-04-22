import test from 'node:test';
import assert from 'node:assert/strict';
import { formSchema } from '../../../src/index.js';

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

test('formSchema initializes values from schema initial', () => {
  const f = formSchema({
    email: { initial: 'a@b.com', required: true, email: true },
    age: { initial: 25, min: 18 },
  });
  assert.deepEqual(f.values.get(), { email: 'a@b.com', age: 25 });
});

test('formSchema validates required and email rules with custom messages', async () => {
  const f = formSchema({
    email: { initial: '', required: true, email: true,
             messages: { required: 'Email is required', email: 'Invalid email' } },
  });
  f.touchAll();
  f.validate();
  await flush();
  assert.equal(f.errors.get().email, 'Email is required');

  f.setValue('email', 'not-an-email');
  await flush();
  assert.equal(f.errors.get().email, 'Invalid email');

  f.setValue('email', 'good@example.com');
  await flush();
  assert.equal(f.errors.get().email, undefined);
});

test('formSchema field() returns reactive value/error/touched', async () => {
  const f = formSchema({
    name: { initial: '', required: true, minLength: 3 },
  });
  const name = f.field('name');
  assert.equal(name.value.get(), '');
  assert.equal(name.error.get(), null, 'no error before touched');
  name.setTouched();
  f.validate();
  await flush();
  assert.equal(name.error.get(), 'This field is required');

  name.setValue('ab');
  await flush();
  assert.equal(name.error.get(), 'Must be at least 3 characters');

  name.setValue('abcd');
  await flush();
  assert.equal(name.error.get(), null);
  assert.equal(name.valid.get(), true);
});

test('formSchema submit prevents and rejects when invalid', async () => {
  const f = formSchema({
    email: { initial: '', required: true },
  });
  let called = false;
  const handler = f.submit(async () => { called = true; });
  const result = await handler();
  assert.equal(result.ok, false);
  assert.equal(called, false);
  assert.ok(result.errors.email);
});

test('formSchema submit calls handler with values when valid', async () => {
  const f = formSchema({
    email: { initial: 'a@b.com', required: true, email: true },
  });
  let received = null;
  const handler = f.submit(async (values) => { received = values; return 'ok'; });
  const result = await handler();
  assert.equal(result.ok, true);
  assert.equal(result.result, 'ok');
  assert.deepEqual(received, { email: 'a@b.com' });
});

test('formSchema supports nested paths', async () => {
  const f = formSchema({
    'profile.name': { initial: '', required: true },
    'profile.age': { initial: 0, min: 1 },
  });
  assert.deepEqual(f.values.get(), { profile: { name: '', age: 0 } });
  f.touchAll();
  f.validate();
  await flush();
  assert.equal(f.errors.get()['profile.name'], 'This field is required');
  assert.equal(f.errors.get()['profile.age'], 'Must be at least 1');

  f.setValue('profile.name', 'Alice');
  f.setValue('profile.age', 30);
  await flush();
  assert.equal(f.valid.get(), true);
});

test('formSchema custom validate returns string as error', async () => {
  const f = formSchema({
    code: {
      initial: 'abc',
      validate: (v) => v.startsWith('x') ? true : 'Must start with x',
    },
  });
  f.touchAll();
  f.validate();
  await flush();
  assert.equal(f.errors.get().code, 'Must start with x');
  f.setValue('code', 'xyz');
  await flush();
  assert.equal(f.errors.get().code, undefined);
});

test('formSchema valid computed reflects errors state', async () => {
  const f = formSchema({
    email: { initial: '', required: true },
  });
  assert.equal(f.valid.get(), true, 'no errors initially (untouched)');
  f.touchAll();
  f.validate();
  await flush();
  assert.equal(f.valid.get(), false);
  f.setValue('email', 'x@y.z');
  await flush();
  assert.equal(f.valid.get(), true);
});
