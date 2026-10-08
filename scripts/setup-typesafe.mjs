import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
if (/^c:[\\/]/i.test(root))
  throw new Error('TypeSafe configuration must stay on the project drive.');
const keyFile = process.argv[2] || resolve(root, '../jev_key.txt');
let key = readFileSync(keyFile, 'utf8').trim();
const assignment = key.match(/^TYPESAFE_API_KEY\s*=\s*(.+)$/);
if (assignment) key = assignment[1].trim().replace(/^(["'])(.*)\1$/, '$2');
if (!key || /\s/.test(key) || key.startsWith('your_'))
  throw new Error('The key file must contain one API key or a TYPESAFE_API_KEY assignment.');
const path = resolve(root, '.env');
const previous = existsSync(path)
  ? readFileSync(path, 'utf8')
  : 'AEGIS_NETWORK=mainnet\nJEV_ENABLE_LIVE=false\n';
const setting = `TYPESAFE_API_KEY=${JSON.stringify(key)}`;
const next = /^TYPESAFE_API_KEY=.*$/m.test(previous)
  ? previous.replace(/^TYPESAFE_API_KEY=.*$/m, setting)
  : previous.trimEnd() + '\n' + setting + '\n';
writeFileSync(path, next);
console.log('TypeSafe key configured in the ignored server .env. No inference request was made.');
