const appOrigin = 'https://aegis.himaloy2608.workers.dev';

function acceptsHtml(accept: string | null): boolean {
  return (accept ?? '').split(',').some((entry) => {
    const [type, ...parameters] = entry.trim().toLowerCase().split(';');
    if (type.trim() !== 'text/html') return false;
    const quality = parameters.find((parameter) => /^\s*q\s*=/.test(parameter));
    if (quality === undefined) return true;
    const value = Number(quality.split('=')[1]?.trim());
    return Number.isFinite(value) && value > 0 && value <= 1;
  });
}

export function legacyNavigationRedirect(
  request: Request,
  assetContentTypes: Readonly<Record<string, string>> = {}
): Response | null {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  if (!acceptsHtml(request.headers.get('Accept'))) return null;

  const current = new URL(request.url);
  let path: string;
  try {
    path = decodeURIComponent(current.pathname);
  } catch {
    return null;
  }
  if (/^\/(?:api|assets)(?:\/|$)/i.test(path)) return null;

  const contentType = Object.hasOwn(assetContentTypes, path)
    ? assetContentTypes[path].split(';')[0].trim().toLowerCase()
    : undefined;
  const lastSegment = path.split('/').filter(Boolean).at(-1) ?? '';
  if (contentType ? contentType !== 'text/html' : lastSegment.includes('.')) return null;

  // Assigning the path keeps a leading // or a query parameter from replacing the fixed host.
  const target = new URL(appOrigin);
  target.pathname = current.pathname;
  target.search = current.search;
  return new Response(null, {
    status: 308,
    headers: {
      Location: target.href,
      'Cache-Control': 'no-store',
      Vary: 'Accept',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
