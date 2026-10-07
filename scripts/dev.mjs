import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
if (/^c:[\\/]/i.test(projectRoot)) throw new Error('Project storage must stay off C:');
const local = resolve(projectRoot, '.local');
const env = { ...process.env,
  TEMP: resolve(local, 'tmp'), TMP: resolve(local, 'tmp'), TMPDIR: resolve(local, 'tmp'),
  XDG_CACHE_HOME: resolve(local, 'cache'), XDG_CONFIG_HOME: resolve(local, 'home/.config'), XDG_DATA_HOME: resolve(local, 'home/.local/share'),
  NPM_CONFIG_CACHE: resolve(local, 'npm-cache'), npm_config_cache: resolve(local, 'npm-cache'),
  PLAYWRIGHT_BROWSERS_PATH: resolve(local, 'playwright'), PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
  NODE_COMPILE_CACHE: resolve(local, 'node/compile-cache'),
  APPDATA: resolve(local, 'home/AppData/Roaming'), LOCALAPPDATA: resolve(local, 'home/AppData/Local'), USERPROFILE: resolve(local, 'home'),
};
for (const folder of ['tmp', 'cache', 'home', 'logs', 'npm-cache']) mkdirSync(resolve(local, folder), { recursive: true });
const api = spawn(process.execPath, ['--experimental-strip-types', 'scripts/server.mjs'], { cwd: projectRoot, env, stdio: 'inherit', windowsHide: true });
const web = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], { cwd: projectRoot, env, stdio: 'inherit', windowsHide: true });
let closing = false;
function close(code = 0) { if (closing) return; closing = true; api.kill(); web.kill(); process.exitCode = code; }
api.on('exit', code => close(code ?? 1)); web.on('exit', code => close(code ?? 1));
process.on('SIGINT', () => close()); process.on('SIGTERM', () => close());
