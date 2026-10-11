import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
if (!/^f:[\\/]/i.test(root)) throw new Error('AI secret storage must stay on F:.');
execFileSync('git', ['check-ignore', '-q', '.env'], { cwd: root });
const mistral = process.argv.includes('--mistral');
const provider = mistral ? 'Mistral' : 'Google';
async function readKey() {
  if (!process.stdin.isTTY) return readFileSync(0, 'utf8').trim();
  console.log(`Enter the ${provider} key. Input is hidden.`);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', receive);
    };
    const receive = (chunk) => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003') {
          finish();
          reject(new Error('Key setup cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          finish();
          resolve(value.trim());
          return;
        }
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
        else value += character;
      }
    };
    process.stdin.on('data', receive);
  });
}
const key = await readKey();
if (!key || /\s/.test(key)) throw new Error(`Supply one ${provider} key through standard input.`);
const path = resolve(root, '.env');
let contents = readFileSync(path, 'utf8');
const set = (name, value, replace = true) => {
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  if (pattern.test(contents)) {
    if (replace) contents = contents.replace(pattern, `${name}=${JSON.stringify(value)}`);
  } else contents = contents.trimEnd() + `\n${name}=${JSON.stringify(value)}\n`;
};
set(mistral ? 'MISTRAL_API_KEY' : 'GEMINI_API_KEY', key);
set('SCOUT_PROJECT_PROVIDER', mistral ? 'mistral' : 'google');
set('AI_SESSION_SECRET', randomBytes(32).toString('hex'), false);
set('AI_IMPLEMENTATION_TOKEN', randomBytes(32).toString('hex'), false);
set('AI_ENABLED', 'false', false);
writeFileSync(path, contents);
console.log(
  'AI credentials configured in the ignored server .env. Local paid inference remains opt-in.'
);
