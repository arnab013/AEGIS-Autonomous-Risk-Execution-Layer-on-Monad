/** Server-held RSA envelopes let release tooling transfer a credential without printing it. */
export async function unwrapServerCredential(value: string, privateJwk?: string): Promise<string> {
  if (!value.startsWith('aegis-rsa1:')) return value;
  if (!privateJwk || value.length > 1024)
    throw new Error('Server credential envelope is unavailable');
  const key = await crypto.subtle.importKey(
    'jwk',
    JSON.parse(privateJwk),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt']
  );
  const bytes = Uint8Array.from(atob(value.slice('aegis-rsa1:'.length)), (character) =>
    character.charCodeAt(0)
  );
  const plaintext = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, key, bytes);
  return new TextDecoder().decode(plaintext);
}
