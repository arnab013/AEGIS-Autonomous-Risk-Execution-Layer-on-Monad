import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { createGateway } from '../server/gateway.mjs';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
if (/^c:[\\/]/i.test(projectRoot)) throw new Error('Project storage must stay off C:');
if (existsSync(resolve(projectRoot, '.env'))) process.loadEnvFile(resolve(projectRoot, '.env'));
const { KuruClient, kuruTestnetConfig, kuruMainnetConfig } = await import('../src/execution/kuruClient.ts');
const { buildJevRequest, parseJevResponse } = await import('../src/jev/client.ts');
const chainConfig = process.env.AEGIS_NETWORK === 'testnet' ? kuruTestnetConfig : kuruMainnetConfig;
const config = {
  apiKey: process.env.TYPESAFE_API_KEY,
  inferenceEnabled: process.env.JEV_ENABLE_LIVE === 'true',
  model: 'jev-latest',
  chainId: chainConfig.chainId, marketAddress: chainConfig.marketAddress, publicRpcUrl: chainConfig.rpcUrl,
  journalDirectory: resolve(projectRoot, '.local/artifacts/audit'),
  allowedOrigins: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  staticDirectory: process.argv.includes('--production') ? resolve(projectRoot, 'dist') : undefined,
};
const server = createGateway({ config, marketClient: new KuruClient(chainConfig), buildRequest: buildJevRequest, validateResponse: parseJevResponse });
const port = Number(process.env.PORT || (config.staticDirectory ? 3000 : 3001));
server.listen(port, '127.0.0.1', () => console.log(`Aegis ${config.staticDirectory ? 'application' : 'API'}: http://127.0.0.1:${port} | Monad ${config.chainId} | live Jev ${config.inferenceEnabled ? 'enabled' : 'disabled'}`));
process.on('SIGTERM', () => server.close());
