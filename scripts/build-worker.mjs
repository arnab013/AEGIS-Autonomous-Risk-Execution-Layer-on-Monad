import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
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
// A single module can be published through the managed connector without exporting an upload token.
await build({
  stdin: {
    contents: `import worker from './cloudflare/worker.ts';
import { createEmbeddedAssets } from './cloudflare/embeddedAssets.ts';
const ASSETS = createEmbeddedAssets(${JSON.stringify(assets)});
export default { fetch(request) { return worker.fetch(request, { ASSETS }); } };`,
    resolveDir: root,
    sourcefile: 'cloudflare-entry.mjs',
  },
  outfile: resolve(output, 'worker.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
});
writeFileSync(resolve(output, 'manifest.json'), JSON.stringify({ manifest }, null, 2));
console.log(
  `Worker bundle with ${Object.keys(manifest).length} embedded assets prepared under .local/artifacts/cloudflare.`
);
