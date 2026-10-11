import { writeFileSync } from 'node:fs';

if (!/^f:[\\/]/i.test(process.cwd())) throw new Error('Verification artifacts must stay on F:.');
process.loadEnvFile('.env');
if (!process.env.GEMINI_API_KEY) throw new Error('The server Gemini key is unavailable.');

const model = 'gemini-3.8-flash';
const root = 'https://generativelanguage.googleapis.com/v1beta';
const report = { observedAt: new Date().toISOString(), model, paidInferenceCalls: 0, checks: {} };
for (const [name, path, body] of [
  ['modelMetadata', `/models/${model}`],
  [
    'countTokens',
    `/models/${model}:countTokens`,
    {
      contents: [{ role: 'user', parts: [{ text: 'Verify the configured model is available.' }] }],
    },
  ],
]) {
  try {
    const response = await fetch(root + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15_000),
    });
    const value = await response.json();
    report.checks[name] = {
      status: response.status,
      ...(response.ok
        ? {
            name: value.name,
            displayName: value.displayName,
            supportedGenerationMethods: value.supportedGenerationMethods,
            inputTokenLimit: value.inputTokenLimit,
            outputTokenLimit: value.outputTokenLimit,
            totalTokens: value.totalTokens,
          }
        : { code: value.error?.code, providerStatus: value.error?.status }),
    };
  } catch {
    report.checks[name] = { unavailable: true };
  }
}
writeFileSync('.local/artifacts/gemini-diagnostics.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
