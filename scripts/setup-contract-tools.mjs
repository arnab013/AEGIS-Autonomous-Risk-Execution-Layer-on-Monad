import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
if (/^c:[\\/]/i.test(root)) throw new Error('Contract tools must stay off C:');
const local = resolve(root, '.local');
const prefix = resolve(local, 'contract-tools');
const env = {
  ...process.env,
  PROJECT_ROOT: root,
  TEMP: resolve(local, 'tmp'),
  TMP: resolve(local, 'tmp'),
  TMPDIR: resolve(local, 'tmp'),
  XDG_CACHE_HOME: resolve(local, 'cache'),
  XDG_CONFIG_HOME: resolve(local, 'home/.config'),
  XDG_DATA_HOME: resolve(local, 'home/.local/share'),
  USERPROFILE: resolve(local, 'home'),
  APPDATA: resolve(local, 'home/AppData/Roaming'),
  LOCALAPPDATA: resolve(local, 'home/AppData/Local'),
  NPM_CONFIG_CACHE: resolve(local, 'npm-cache'),
  npm_config_cache: resolve(local, 'npm-cache'),
};
for (const folder of [
  prefix,
  env.TEMP,
  env.XDG_CACHE_HOME,
  env.XDG_CONFIG_HOME,
  env.XDG_DATA_HOME,
  env.USERPROFILE,
  env.APPDATA,
  env.LOCALAPPDATA,
  env.NPM_CONFIG_CACHE,
])
  mkdirSync(folder, { recursive: true });
for (const file of ['package.json', 'package-lock.json'])
  copyFileSync(resolve(root, 'contracts/toolchain', file), resolve(prefix, file));
const npmCli = resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
if (!existsSync(npmCli))
  throw new Error(
    'npm CLI not found beside Node; use the local storage PowerShell setup and npm --prefix .local/contract-tools ci --ignore-scripts'
  );
const result = spawnSync(
  process.execPath,
  [npmCli, 'ci', '--prefix', prefix, '--no-audit', '--no-fund', '--ignore-scripts'],
  { cwd: root, env, stdio: 'inherit', windowsHide: true }
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
