import { describe, expect, it, vi } from 'vitest';
import { createEmbeddedAssets } from '../cloudflare/embeddedAssets.ts';

const origin = 'https://aegis.example.workers.dev';
const files = {
  '/index.html': { contentType: 'text/html; charset=utf-8', text: '<html>Aegis ✓</html>' },
  '/assets/index-Ab12Cd34.js': { contentType: 'text/javascript', text: 'console.log("Aegis");' },
  '/assets/index-Xy98Uv76.css': { contentType: 'text/css', text: 'body{color:white}' },
  '/logo.svg': { contentType: 'image/svg+xml', text: '<svg></svg>' },
  '/assets/icon-Ab12Cd34.png': { contentType: 'image/png', base64: 'AP+AQQ==' },
  '/empty.txt': { contentType: 'text/plain', text: '' },
  '/notes with spaces.txt': { contentType: 'text/plain', text: 'Local file' },
};
const request = (path: string, options: RequestInit = {}) => new Request(origin + path, options);

describe('Embedded static assets', () => {
  it('maps the root to the index and serves native Unicode text', async () => {
    const assets = createEmbeddedAssets(files);
    const response = await assets.fetch(request('/'));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(files['/index.html'].text);
    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toBe('no-cache');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it.each(['/assets/index-Ab12Cd34.js', '/assets/index-Xy98Uv76.css'] as const)(
    'serves known hashed text asset %s with immutable caching',
    async (path) => {
      const response = await createEmbeddedAssets(files).fetch(request(path + '?v=1'));
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(files[path].text);
      expect(response.headers.get('Content-Type')).toBe(files[path].contentType);
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    }
  );

  it('decodes only the binary record and preserves its exact bytes', async () => {
    const decode = vi.spyOn(globalThis, 'atob');
    try {
      const assets = createEmbeddedAssets(files);
      const text = await assets.fetch(request('/logo.svg'));
      expect(await text.text()).toBe('<svg></svg>');
      expect(decode).not.toHaveBeenCalled();
      const binary = await assets.fetch(request('/assets/icon-Ab12Cd34.png'));
      expect(Array.from(new Uint8Array(await binary.arrayBuffer()))).toEqual([0, 255, 128, 65]);
      expect(binary.headers.get('Content-Type')).toBe('image/png');
      expect(binary.headers.get('Cache-Control')).toContain('immutable');
      expect(decode).toHaveBeenCalledExactlyOnceWith('AP+AQQ==');
    } finally {
      decode.mockRestore();
    }
  });

  it('supports HEAD without reading or decoding the binary body', async () => {
    const decode = vi.spyOn(globalThis, 'atob');
    try {
      const response = await createEmbeddedAssets(files).fetch(
        request('/assets/icon-Ab12Cd34.png', { method: 'HEAD' })
      );
      expect(response.status).toBe(200);
      expect(response.body).toBeNull();
      expect(response.headers.get('Content-Type')).toBe('image/png');
      expect(response.headers.get('Cache-Control')).toContain('immutable');
      expect(decode).not.toHaveBeenCalled();
    } finally {
      decode.mockRestore();
    }
  });

  it('keeps unhashed assets fresh and supports empty text records', async () => {
    const assets = createEmbeddedAssets(files);
    const response = await assets.fetch(request('/empty.txt'));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
    expect(response.headers.get('Cache-Control')).toBe('no-cache');
  });

  it('matches decoded paths without including the query string', async () => {
    const response = await createEmbeddedAssets(files).fetch(
      request('/notes%20with%20spaces.txt?download=1')
    );
    expect(await response.text()).toBe('Local file');
  });

  it.each(['/replay/session', '/review.html'])(
    'uses the index for a missing HTML navigation %s only when explicitly accepted',
    async (path) => {
      const assets = createEmbeddedAssets(files);
      expect((await assets.fetch(request(path))).status).toBe(404);
      const response = await assets.fetch(
        request(path, { headers: { Accept: 'text/html,application/xhtml+xml' } })
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(files['/index.html'].text);
      expect(response.headers.get('Cache-Control')).toBe('no-cache');
    }
  );

  it.each(['/missing.js', '/assets/missing.png', '/missing.json'])(
    'keeps absent non-HTML file %s a 404 even for a browser navigation',
    async (path) => {
      const response = await createEmbeddedAssets(files).fetch(
        request(path, { headers: { Accept: 'text/html' } })
      );
      expect(response.status).toBe(404);
      expect(await response.text()).toBe('Not found');
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    }
  );

  it.each(['application/json', '*/*', 'text/html;q=0', 'text/html;q=0.0,application/json'])(
    'does not use HTML fallback for Accept %s',
    async (accept) => {
      const response = await createEmbeddedAssets(files).fetch(
        request('/missing', { headers: { Accept: accept } })
      );
      expect(response.status).toBe(404);
    }
  );

  it('handles HEAD on an HTML fallback or a missing path without a body', async () => {
    const assets = createEmbeddedAssets(files);
    const fallback = await assets.fetch(
      request('/replay', { method: 'HEAD', headers: { Accept: 'text/html' } })
    );
    expect(fallback.status).toBe(200);
    expect(fallback.body).toBeNull();
    const missing = await assets.fetch(request('/missing.js', { method: 'HEAD' }));
    expect(missing.status).toBe(404);
    expect(missing.body).toBeNull();
  });

  it.each(['POST', 'PUT', 'DELETE', 'OPTIONS'])(
    'rejects %s rather than returning the SPA',
    async (method) => {
      const response = await createEmbeddedAssets(files).fetch(request('/', { method }));
      expect(response.status).toBe(405);
      expect(response.headers.get('Allow')).toBe('GET, HEAD');
      expect(response.headers.get('Cache-Control')).toBe('no-cache');
    }
  );

  it('returns 404 when the manifest has no index to use for an HTML fallback', async () => {
    const response = await createEmbeddedAssets({}).fetch(
      request('/missing', { headers: { Accept: 'text/html' } })
    );
    expect(response.status).toBe(404);
  });

  it('does not resolve inherited manifest entries', async () => {
    const inherited = Object.create(files) as typeof files;
    const response = await createEmbeddedAssets(inherited).fetch(
      request('/assets/index-Ab12Cd34.js')
    );
    expect(response.status).toBe(404);
  });

  it('rejects malformed percent-encoded paths', async () => {
    const response = await createEmbeddedAssets(files).fetch(request('/broken%ZZ'));
    expect(response.status).toBe(400);
  });
});
