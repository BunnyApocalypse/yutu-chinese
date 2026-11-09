// The sync code, and encrypting what is synced with it (sync.md).
//
// The sync code is the one secret a learner's devices share: made on the
// first device, typed (or opened as a link) on the others, and kept to get
// everything back if every device is lost. Nothing else is needed: no
// account, no password. From it come three things, worked out the same way
// on every device:
//
//   account     an ID the server files the learner's files under; it sees it
//   access      a second secret sent with each request, so that knowing the
//               account ID (from a log, say) isn't enough to delete files
//   encryption  the key every file is encrypted with; it never leaves the
//               device
//
// All of it with WebCrypto (`crypto.subtle`), built into the browser (and
// into Node, for the tests): no library, and no encryption of our own
// making. HKDF is the standard way to make several keys from one secret;
// AES-GCM encrypts and also catches any change to what it encrypted.

// The letters a code is written in: Crockford's base 32, digits and capital
// letters without I, L, O and U, which are easily mixed up with 1, 0 and V
// (and U makes words). Each stands for 5 bits.
const LETTERS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

// 30 random letters (150 bits: far too many to guess) and 2 that check them,
// so that a typing mistake is told apart from a code with nothing synced.
const SECRET_LENGTH = 30;
const CODE_LENGTH = 32;

const encoder = new TextEncoder();

// The two letters checking a code's 30: from its SHA-256 hash.
async function checkLetters(secret) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(secret)));
  return LETTERS[hash[0] % 32] + LETTERS[hash[1] % 32];
}

// A new sync code, as 32 letters without spaces (formatCode shows it).
export async function makeCode() {
  // 256 is a multiple of 32, so each letter is as likely as any other.
  const bytes = crypto.getRandomValues(new Uint8Array(SECRET_LENGTH));
  const secret = Array.from(bytes, (byte) => LETTERS[byte % 32]).join('');
  return secret + (await checkLetters(secret));
}

// A code as shown to the learner: groups of four, "ABCD-EFGH-…".
export function formatCode(code) {
  return code.match(/.{1,4}/g).join('-');
}

// A code as typed or pasted: any case, with or without dashes and spaces,
// O for 0 and I or L for 1, as Crockford's letters allow.
//
// Returns { code } (32 letters), or { reason }: 'length' (too few or too many
// letters), 'letters' (one that is never in a code), 'mistyped' (the check
// letters don't match: a letter is wrong).
export async function readCode(typed) {
  const letters = String(typed)
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (letters.length !== CODE_LENGTH) {
    return { reason: 'length' };
  }
  if ([...letters].some((letter) => !LETTERS.includes(letter))) {
    return { reason: 'letters' };
  }
  const secret = letters.slice(0, SECRET_LENGTH);
  if (letters.slice(SECRET_LENGTH) !== (await checkLetters(secret))) {
    return { reason: 'mistyped' };
  }
  return { code: letters };
}

const hex = (bytes) => Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');

// What a code gives: { account, access, encryption } (see the top). The
// account and access are hexadecimal text; the encryption key is a CryptoKey
// that can encrypt and decrypt but not be read out, even by the app.
export async function keysFor(code) {
  const secret = await crypto.subtle.importKey('raw', encoder.encode(code.slice(0, SECRET_LENGTH)), 'HKDF', false, [
    'deriveBits',
    'deriveKey',
  ]);
  // The same salt for everyone: it only keeps these keys apart from any
  // other use of the same secret. The code itself is random enough.
  const params = (info) => ({ name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('yutu-chinese sync 1'), info: encoder.encode(info) });
  return {
    account: hex(await crypto.subtle.deriveBits(params('account'), secret, 128)),
    access: hex(await crypto.subtle.deriveBits(params('access'), secret, 256)),
    encryption: await crypto.subtle.deriveKey(params('encryption'), secret, { name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]),
  };
}

// The first byte of every file: the way it is encrypted, should it change.
const FILE_VERSION = 1;

// Encrypts a file's bytes. The file's name goes into the encryption as well
// ("additional data"), so a file can't be passed off as another: opening it
// under any other name fails.
//
// Returns the version byte, the 12 random bytes AES-GCM starts from (the
// "IV", new for every file and stored with it), then the encrypted bytes.
export async function encrypt(key, name, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(name) }, key, bytes),
  );
  const file = new Uint8Array(1 + iv.length + sealed.length);
  file[0] = FILE_VERSION;
  file.set(iv, 1);
  file.set(sealed, 1 + iv.length);
  return file;
}

// Opens what encrypt made. Throws, with error.reason 'cannot-open', for a
// file made with another code, under another name, or changed in any way.
export async function decrypt(key, name, file) {
  try {
    if (file[0] !== FILE_VERSION) {
      throw new Error('unknown version');
    }
    return new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: file.slice(1, 13), additionalData: encoder.encode(name) },
        key,
        file.slice(13),
      ),
    );
  } catch {
    throw Object.assign(new Error('This file cannot be opened with this sync code.'), { reason: 'cannot-open' });
  }
}
