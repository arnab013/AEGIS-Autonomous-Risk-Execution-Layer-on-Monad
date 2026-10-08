import { describe, expect, it } from 'vitest';
import { legacyNavigationRedirect } from '../cloudflare/legacyRedirect.ts';
import { createEmbeddedAssets } from '../cloudflare/embeddedAssets.ts';

const previousOrigin = 'https://aegis-risk-terminal.himaloy2608.workers.dev';
const newOrigin = 'https://aegis.himaloy2608.workers.dev';
const assetTypes = {
  '/index.html': 'text/html; charset=utf-8',
  '/review.html': 'text/html',
  '/assets/index-Ab12Cd34.js': 'text/javascript',
  '/logo': 'image/svg+xml',
};
const request = (path: string, options: RequestInit = {}) =>
  new Request(previousOrigin + path, { headers: { Accept: 'text/html' }, ...options });

describe('Legacy address navigation', () => {
  it.each(['/', '/index.html', '/review.html', '/replay/session', '/review/?mode=live&clip=200'])(
    'redirects page navigation %s to the fixed new origin',
    (path) => {
      const response = legacyNavigationRedirect(request(path), assetTypes);
      expect(response?.status).toBe(308);
      expect(response?.headers.get('Location')).toBe(newOrigin + path);
      expect(response?.headers.get('Cache-Control')).toBe('no-store');
      expect(response?.headers.get('Vary')).toBe('Accept');
      expect(response?.body).toBeNull();
    }
  );

  it('preserves encoded paths and query values without interpreting a new destination', () => {
    const path = '//external.example/review?next=https%3A%2F%2Fexternal.example%2F';
    const response = legacyNavigationRedirect(request(path), assetTypes);
    expect(response?.headers.get('Location')).toBe(newOrigin + path);
    const encoded = '/review%20trade?clip=200%20MON&next=%2Fapi%2Frpc';
    expect(legacyNavigationRedirect(request(encoded))?.headers.get('Location')).toBe(
      newOrigin + encoded
    );
  });

  it('redirects HEAD without a body', () => {
    const response = legacyNavigationRedirect(request('/review', { method: 'HEAD' }));
    expect(response?.status).toBe(308);
    expect(response?.body).toBeNull();
  });

  it.each(['POST', 'PUT', 'DELETE', 'OPTIONS'])(
    'leaves %s requests with the existing Worker',
    (method) => {
      expect(legacyNavigationRedirect(request('/', { method }), assetTypes)).toBeNull();
    }
  );

  it.each([
    '/api',
    '/api/status',
    '/api/rpc',
    '/%61pi/market',
    '/api%2Frpc',
    '/assets',
    '/assets/no-extension',
    '/assets/index-Ab12Cd34.js',
    '/missing.css',
    '/missing.html',
    '/logo',
    '/logo.svg',
    '/broken%ZZ',
  ])('leaves API/static or invalid path %s with the existing Worker', (path) => {
    expect(legacyNavigationRedirect(request(path), assetTypes)).toBeNull();
  });

  it.each(['*/*', 'application/json', 'text/html;q=0', 'text/html;q=invalid', 'text/html;q=2'])(
    'requires explicit positive HTML acceptance, rejecting %s',
    (accept) => {
      expect(
        legacyNavigationRedirect(request('/', { headers: { Accept: accept } }), assetTypes)
      ).toBeNull();
    }
  );

  it('leaves requests without an Accept header with the existing Worker', () => {
    expect(legacyNavigationRedirect(request('/', { headers: {} }), assetTypes)).toBeNull();
  });

  it.each(['application/json, TEXT/HTML; Q=0.8', 'text/html;q=0.1,application/xhtml+xml'])(
    'accepts browser navigation header %s',
    (accept) => {
      expect(
        legacyNavigationRedirect(request('/', { headers: { Accept: accept } }), assetTypes)?.status
      ).toBe(308);
    }
  );

  it('keeps a prior hashed asset usable for an already-open browser session', async () => {
    const originalRequest = request('/assets/index-Ab12Cd34.js');
    const redirect = legacyNavigationRedirect(originalRequest, assetTypes);
    expect(redirect).toBeNull();
    const assets = createEmbeddedAssets({
      '/assets/index-Ab12Cd34.js': {
        contentType: 'text/javascript',
        text: 'console.log("prior build");',
      },
    });
    const response = await assets.fetch(originalRequest);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('console.log("prior build");');
  });
});
