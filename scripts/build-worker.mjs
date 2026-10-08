import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = resolve(root, '.local/artifacts/cloudflare');
mkdirSync(output, { recursive: true });
const directory = resolve(root, 'dist');
const manifest = {},
  assets = {};
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
for (const file of readdirSync(directory, { recursive: true, withFileTypes: true })) {
  if (!file.isFile()) continue;
  const path = resolve(file.parentPath, file.name);
  const content = readFileSync(path);
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 32);
  const route = '/' + relative(directory, path).replaceAll('\\', '/');
  manifest[route] = { hash, size: content.length };
  const contentType = types[extname(path)] || 'application/octet-stream';
  assets[route] = /^(?:text\/|image\/svg)/.test(contentType)
    ? { contentType, text: content.toString('utf8') }
    : { contentType, base64: content.toString('base64') };
}
const legacyAssetPath = resolve(output, 'legacy-assets.json');
const previousAssets = existsSync(legacyAssetPath)
  ? JSON.parse(readFileSync(legacyAssetPath, 'utf8')).assets
  : {};
const legacyAssets = { ...previousAssets, ...assets };
// Old pages retain their hashed files so they can finish using the previous address.
writeFileSync(legacyAssetPath, JSON.stringify({ assets: legacyAssets }));

async function bundleWorker(fileName, files, legacy = false) {
  const contentTypes = Object.fromEntries(
    Object.entries(files).map(([route, file]) => [route, file.contentType])
  );
  // A single module can be published through the managed connector without an upload token.
  await build({
    stdin: {
      contents: `import worker from './cloudflare/worker.ts';
import { createEmbeddedAssets } from './cloudflare/embeddedAssets.ts';
${legacy ? "import { legacyNavigationRedirect } from './cloudflare/legacyRedirect.ts';" : ''}
const ASSETS = createEmbeddedAssets(${JSON.stringify(files)});
${legacy ? `const contentTypes = ${JSON.stringify(contentTypes)};` : ''}
export default { fetch(request, env = {}) {
  ${legacy ? 'const redirect = legacyNavigationRedirect(request, contentTypes); if (redirect) return redirect;' : ''}
  return worker.fetch(request, { ...env, ASSETS });
} };`,
      resolveDir: root,
      sourcefile: legacy ? 'cloudflare-legacy-entry.mjs' : 'cloudflare-entry.mjs',
    },
    outfile: resolve(output, fileName),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
  });
}

await bundleWorker('worker.mjs', assets);
await bundleWorker('legacy-worker.mjs', legacyAssets, true);
writeFileSync(resolve(output, 'manifest.json'), JSON.stringify({ manifest }, null, 2));
console.log(
  `App and legacy Worker bundles prepared under .local/artifacts/cloudflare (${Object.keys(assets).length} current assets, ${Object.keys(legacyAssets).length} retained assets).`
);
