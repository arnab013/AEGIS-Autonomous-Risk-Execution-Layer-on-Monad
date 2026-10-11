import { describe, it, expect } from 'vitest';
import { unwrapServerCredential } from '../cloudflare/credentials.ts';

describe('server credential envelopes', () => {
  it('opens only with the intended private key and keeps plaintext out of the transfer', async () => {
    const pair = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt']
    );
    const secret = 'fixture-provider-key';
    const bytes = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      pair.publicKey,
      new TextEncoder().encode(secret)
    );
    const envelope = 'aegis-rsa1:' + btoa(String.fromCharCode(...new Uint8Array(bytes)));
    expect(envelope).not.toContain(secret);
    const privateJwk = JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey));
    expect(await unwrapServerCredential(envelope, privateJwk)).toBe(secret);
    await expect(unwrapServerCredential(envelope)).rejects.toThrow();
    await expect(unwrapServerCredential('aegis-rsa1:broken', privateJwk)).rejects.toThrow();
  });
  it('preserves ordinary server bindings', async () => {
    expect(await unwrapServerCredential('fixture-provider-key')).toBe('fixture-provider-key');
  });
});
