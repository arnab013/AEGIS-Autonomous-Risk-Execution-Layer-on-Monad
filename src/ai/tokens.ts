const encoder = new TextEncoder();

export function canonicalJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === 'object')
      return Object.fromEntries(
        Object.entries(item)
          .filter(([, value]) => value !== undefined)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([name, value]) => [name, normalize(value)])
      );
    return item;
  };
  return JSON.stringify(normalize(value));
}

const base64 = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
const decode = (value: string) =>
  Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (character) =>
    character.charCodeAt(0)
  );

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function hash(value: unknown): Promise<string> {
  return base64(
    new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(canonicalJson(value))))
  );
}

export async function signToken(value: unknown, secret: string): Promise<string> {
  const payload = base64(encoder.encode(canonicalJson(value)));
  return `${payload}.${base64(new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(payload))))}`;
}

export async function verifyToken<T>(token: string, secret: string): Promise<T> {
  if (
    typeof token !== 'string' ||
    token.length > 16_384 ||
    !/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(token)
  )
    throw new TypeError('Invalid approval or session token');
  const [payload, signature] = token.split('.');
  try {
    if (
      !(await crypto.subtle.verify(
        'HMAC',
        await key(secret),
        decode(signature),
        encoder.encode(payload)
      ))
    )
      throw new Error('Invalid signature');
    return JSON.parse(new TextDecoder().decode(decode(payload))) as T;
  } catch {
    throw new TypeError('Approval or session token could not be verified');
  }
}

export async function privateFingerprint(value: string, secret: string): Promise<string> {
  return base64(
    new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(value)))
  );
}
