import test from 'node:test';
import assert from 'node:assert/strict';
import { createToken, validateEmployeeInput, verifyToken } from './security.js';

test('validateEmployeeInput returns no errors for valid payload', () => {
  const errors = validateEmployeeInput({
    name: 'Alice Example',
    email: 'alice@example.com',
    department: 'Engineering',
    position: 'Developer',
    salary: 1000,
  });

  assert.deepEqual(errors, []);
});

test('validateEmployeeInput catches invalid fields', () => {
  const errors = validateEmployeeInput({
    name: '',
    email: 'invalid-email',
    department: '',
    position: '',
    salary: -1,
  });

  assert.ok(errors.length >= 4);
});

test('createToken and verifyToken round-trip', async () => {
  const exp = Math.floor(Date.now() / 1000) + 60;
  const token = await createToken({ sub: 'admin', role: 'admin', exp }, 'test-secret');
  const payload = await verifyToken(token, 'test-secret');

  assert.equal(payload.sub, 'admin');
  assert.equal(payload.role, 'admin');
});

test('verifyToken rejects tampered token', async () => {
  const exp = Math.floor(Date.now() / 1000) + 60;
  const token = await createToken({ sub: 'admin', role: 'admin', exp }, 'test-secret');
  const [body, signature] = token.split('.');
  const tamperedSignature = signature.slice(0, -1) + (signature.endsWith('a') ? 'b' : 'a');
  const tampered = `${body}.${tamperedSignature}`;
  const payload = await verifyToken(tampered, 'test-secret');

  assert.equal(payload, null);
});
