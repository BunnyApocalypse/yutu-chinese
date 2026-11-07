// Tests for src/syncCode.js: the sync code and encrypting with it.
//
// Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';

import { makeCode, formatCode, readCode, keysFor, encrypt, decrypt } from '../src/syncCode.js';

const encoder = new TextEncoder();

test('a new code is 32 letters of the code alphabet, different each time', async () => {
  const codes = await Promise.all(Array.from({ length: 50 }, makeCode));
  for (const code of codes) {
    assert.match(code, /^[0-9A-HJKMNP-TV-Z]{32}$/);
  }
  assert.equal(new Set(codes).size, codes.length);
  assert.match(formatCode(codes[0]), /^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/);
});

test('a code is read however it is typed, and a typing mistake is caught', async () => {
  const code = await makeCode();
  assert.deepEqual(await readCode(formatCode(code)), { code });
  assert.deepEqual(await readCode(` ${formatCode(code).toLowerCase().replace(/-/g, ' ')} `), { code });
  // O typed for 0, and l or I for 1.
  const withZero = code.slice(0, 30).replace(/0/g, 'O').replace(/1/g, 'l') + code.slice(30);
  assert.deepEqual(await readCode(withZero), { code });

  assert.deepEqual(await readCode(code.slice(1)), { reason: 'length' });
  assert.deepEqual(await readCode(`${code.slice(0, 31)}U`), { reason: 'letters' });
  // A letter changed is noticed, each of the 30 in turn.
  let caught = 0;
  for (let at = 0; at < 30; at++) {
    const other = code[at] === 'A' ? 'B' : 'A';
    const typed = code.slice(0, at) + other + code.slice(at + 1);
    if ((await readCode(typed)).reason === 'mistyped') {
      caught++;
    }
  }
  // Two check letters miss a wrong letter about once in a thousand times,
  // so allow two misses: three would come about once in ten million runs.
  assert.ok(caught >= 28, `${caught} of 30`);
});

test('the same code gives the same keys on every device, another code others', async () => {
  const code = await makeCode();
  const one = await keysFor(code);
  const two = await keysFor(code);
  assert.match(one.account, /^[0-9a-f]{32}$/);
  assert.match(one.access, /^[0-9a-f]{64}$/);
  assert.equal(one.account, two.account);
  assert.equal(one.access, two.access);
  assert.notEqual(one.account, one.access.slice(0, 32));
  // What one device encrypts, another opens.
  const file = await encrypt(one.encryption, 'batch-a-1', encoder.encode('愛'));
  assert.equal(new TextDecoder().decode(await decrypt(two.encryption, 'batch-a-1', file)), '愛');

  const other = await keysFor(await makeCode());
  assert.notEqual(other.account, one.account);
  await assert.rejects(decrypt(other.encryption, 'batch-a-1', file), { reason: 'cannot-open' });
});

test('the encryption key can\'t be read out, even by the app', async () => {
  const { encryption } = await keysFor(await makeCode());
  assert.equal(encryption.extractable, false);
  await assert.rejects(crypto.subtle.exportKey('raw', encryption));
});

test('an encrypted file shows nothing of what is in it, and can\'t be changed or renamed', async () => {
  const { encryption } = await keysFor(await makeCode());
  const text = JSON.stringify({ words: [{ id: '愛|ai4', definition: 'love' }] });
  const file = await encrypt(encryption, 'batch-a-0000000001', encoder.encode(text));
  const seen = Buffer.from(file).toString('latin1');
  for (const piece of ['ai4', 'love', 'words', Buffer.from('愛').toString('latin1')]) {
    assert.ok(!seen.includes(piece), piece);
  }
  // The same contents encrypt differently each time (a fresh IV).
  const again = await encrypt(encryption, 'batch-a-0000000001', encoder.encode(text));
  assert.notDeepEqual(again, file);

  await assert.rejects(decrypt(encryption, 'batch-a-0000000002', file), { reason: 'cannot-open' });
  const changed = file.slice();
  changed[20] ^= 1;
  await assert.rejects(decrypt(encryption, 'batch-a-0000000001', changed), { reason: 'cannot-open' });
  const unknown = file.slice();
  unknown[0] = 9;
  await assert.rejects(decrypt(encryption, 'batch-a-0000000001', unknown), { reason: 'cannot-open' });
});
