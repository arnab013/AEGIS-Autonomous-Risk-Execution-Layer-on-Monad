import { generateKeyPairSync } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

if (!/^f:[\\/]/i.test(process.cwd())) throw new Error('Verification secrets must stay on F:.');
execFileSync('git', ['check-ignore', '-q', '.env']);
let env = readFileSync('.env', 'utf8');
const old = env.match(/^AI_VERIFICATION_PRIVATE_JWK=(.*)$/m);
const saved = env.match(/^AI_VERIFICATION_PRIVATE_JWK_B64=(.*)$/m);
const privateJwk = saved
  ? JSON.parse(Buffer.from(saved[1].replaceAll('"', ''), 'base64').toString('utf8'))
  : old
    ? JSON.parse(JSON.parse(old[1]))
    : generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ format: 'jwk' });
const publicJwk = { kty: 'RSA', n: privateJwk.n, e: privateJwk.e };
const line = `AI_VERIFICATION_PRIVATE_JWK_B64=${Buffer.from(JSON.stringify(privateJwk)).toString('base64')}`;
env = env.replace(/^AI_VERIFICATION_PRIVATE_JWK=.*\r?\n?/m, '');
env = /^AI_VERIFICATION_PRIVATE_JWK_B64=.*$/m.test(env)
  ? env.replace(/^AI_VERIFICATION_PRIVATE_JWK_B64=.*$/m, line)
  : env.trimEnd() + '\n' + line + '\n';
writeFileSync('.env', env);
// The public half contains no credential or private key material.
process.stdout.write(JSON.stringify(publicJwk));
