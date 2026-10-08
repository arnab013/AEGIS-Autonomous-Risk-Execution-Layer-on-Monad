type EmbeddedFile = { contentType: string; text?: string; base64?: string };

function acceptsHtml(request: Request): boolean {
  return (request.headers.get('Accept') ?? '').split(',').some((range) => {
    const [mediaType, ...parameters] = range.trim().toLowerCase().split(';');
    if (mediaType.trim() !== 'text/html') return false;
    const quality = parameters.find((parameter) => parameter.trim().startsWith('q='));
    return quality === undefined || Number(quality.trim().slice(2)) > 0;
  });
}

export function createEmbeddedAssets(files: Record<string, EmbeddedFile>): {
  fetch(request: Request): Promise<Response>;
} {
  return {
    async fetch(request: Request): Promise<Response> {
      const headers = new Headers({
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-cache',
      });
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        headers.set('Allow', 'GET, HEAD');
        return new Response('Method not allowed', { status: 405, headers });
      }

      let path: string;
      try {
        path = decodeURIComponent(new URL(request.url).pathname);
      } catch {
        return new Response(request.method === 'HEAD' ? null : 'Invalid path', {
          status: 400,
          headers,
        });
      }
      if (path === '/') path = '/index.html';
      if (!Object.hasOwn(files, path)) {
        // An absent script or image must stay a 404, even when opened as a page.
        const htmlPath = !/\.[^/]+$/.test(path) || /\.html?$/i.test(path);
        if (htmlPath && acceptsHtml(request) && Object.hasOwn(files, '/index.html'))
          path = '/index.html';
        else
          return new Response(request.method === 'HEAD' ? null : 'Not found', {
            status: 404,
            headers,
          });
      }
      const file = files[path];
      headers.set('Content-Type', file.contentType);
      if (path !== '/index.html' && /[-.][A-Za-z0-9_-]{8,}\.[^/]+$/.test(path))
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      if (request.method === 'HEAD') return new Response(null, { status: 200, headers });
      if (file.text !== undefined) return new Response(file.text, { headers });
      if (file.base64 !== undefined) {
        const bytes = Uint8Array.from(atob(file.base64), (character) => character.charCodeAt(0));
        return new Response(bytes, { headers });
      }
      throw new TypeError(`Embedded asset ${path} has no content`);
    },
  };
}
