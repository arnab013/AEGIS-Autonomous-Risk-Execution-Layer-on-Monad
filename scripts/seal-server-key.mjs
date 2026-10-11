import { readFileSync, writeFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { resolve } from 'node:path';

const root = process.cwd();
if (!/^f:[\\/]/i.test(root)) throw new Error('Credential transport must stay on F:.');
const publicKey = JSON.parse(
  readFileSync(resolve(root, '.local/artifacts/cloudflare/key-wrap-public.json'), 'utf8')
);
let credential = readFileSync('F:/Projects/jev_key.txt', 'utf8').trim();
const assignment = credential.match(/^TYPESAFE_API_KEY\s*=\s*(.+)$/);
if (assignment) credential = assignment[1].trim().replace(/^(["'])(.*)\1$/, '$2');
if (!credential || /\s/.test(credential))
  throw new Error('The server key file has an invalid format.');
const key = await webcrypto.subtle.importKey(
  'jwk',
  publicKey,
  { name: 'RSA-OAEP', hash: 'SHA-256' },
  false,
  ['encrypt']
);
const ciphertext = await webcrypto.subtle.encrypt(
  { name: 'RSA-OAEP' },
  key,
  new TextEncoder().encode(credential)
);
writeFileSync(
  resolve(root, '.local/artifacts/cloudflare/jev-envelope.txt'),
  'aegis-rsa1:' + Buffer.from(ciphertext).toString('base64')
);
console.log('Sealed the Jev credential for the server-held private key. No plaintext was emitted.');
