import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodeFunctionResult, encodeDeployData, encodeFunctionData, parseUnits } from 'viem';
import type { Abi } from 'viem';
// Local toolchain installed separately so every download and compiler cache stays on F:.
// Run scripts/setup-contract-tools.mjs once after the local storage environment is configured.
const toolRoot = path.join(process.cwd(), '.local', 'contract-tools', 'node_modules');
const loadTool = (relative: string) =>
  import(/* @vite-ignore */ pathToFileURL(path.join(toolRoot, relative)).href);
let solc: any,
  createVM: any,
  Common: any,
  Hardfork: any,
  Mainnet: any,
  Account: any,
  createAddressFromString: any,
  hexToBytes: any,
  bytesToHex: any,
  createBlock: any;
let artifacts: Record<
  string,
  {
    abi: Abi;
    bytecode: `0x${string}`;
  }
> = {};
const OWNER = '0x1111111111111111111111111111111111111111';
const AGENT = '0x2222222222222222222222222222222222222222';
const ATTACKER = '0x9999999999999999999999999999999999999999';
const MON = (amount: string) => parseUnits(amount, 18);
const SIZE = 2000000000000n;
let vm: any, quote: string, market: string, guard: string, timestamp: bigint;
function block() {
  return createBlock(
    { header: { number: 1n, timestamp, gasLimit: 30000000n } },
    { common: vm.common, skipConsensusFormatValidation: true }
  );
}
async function invoke(
  address: string,
  contractName: string,
  functionName: string,
  args: unknown[] = [],
  caller = OWNER,
  value = 0n
) {
  const artifact = artifacts[contractName];
  return vm.evm.runCall({
    caller: createAddressFromString(caller),
    origin: createAddressFromString(caller),
    to: createAddressFromString(address),
    data: hexToBytes(encodeFunctionData({ abi: artifact.abi, functionName, args })),
    value,
    gasLimit: 10000000n,
    block: block(),
  });
}
async function read(
  address: string,
  contractName: string,
  functionName: string,
  args: unknown[] = []
) {
  const result = await invoke(address, contractName, functionName, args);
  expect(result.execResult.exceptionError).toBeUndefined();
  return decodeFunctionResult({
    abi: artifacts[contractName].abi,
    functionName,
    data: bytesToHex(result.execResult.returnValue),
  });
}
async function deploy(contractName: string, args: unknown[] = []) {
  const artifact = artifacts[contractName];
  const result = await vm.evm.runCall({
    caller: createAddressFromString(OWNER),
    origin: createAddressFromString(OWNER),
    data: hexToBytes(encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode, args })),
    gasLimit: 20000000n,
    block: block(),
  });
  if (result.execResult.exceptionError)
    throw new Error(
      `${contractName} deployment failed: ${result.execResult.exceptionError.error} ${bytesToHex(result.execResult.returnValue)}`
    );
  return result.createdAddress.toString();
}
function revertReason(result: any): string {
  const data = bytesToHex(result.execResult.returnValue);
  if (data.startsWith('0x08c379a0')) {
    const bytes = result.execResult.returnValue.subarray(68);
    return Buffer.from(bytes).toString('utf8').replace(/\0+$/, '');
  }
  return result.execResult.exceptionError?.error ?? '';
}
async function mustRevert(result: any, reason: string) {
  expect(result.execResult.exceptionError).toBeDefined();
  expect(revertReason(result)).toContain(reason);
}
async function sell(caller = AGENT, size = SIZE, minOut = 3900000n) {
  return invoke(guard, 'PolicyGuard', 'executeMarketSell', [size, minOut, timestamp + 60n], caller);
}
beforeAll(async () => {
  try {
    const modules = await Promise.all([
      loadTool('solc/index.js'),
      loadTool('@ethereumjs/vm/dist/esm/index.js'),
      loadTool('@ethereumjs/common/dist/esm/index.js'),
      loadTool('@ethereumjs/util/dist/esm/index.js'),
      loadTool('@ethereumjs/block/dist/esm/index.js'),
    ]);
    solc = modules[0].default;
    ({ createVM } = modules[1]);
    ({ Common, Hardfork, Mainnet } = modules[2]);
    ({ Account, createAddressFromString, hexToBytes, bytesToHex } = modules[3]);
    ({ createBlock } = modules[4]);
  } catch (error) {
    throw new Error(
      `Install contract test tools first: node scripts/setup-contract-tools.mjs. ${String(error)}`
    );
  }
  const sources = Object.fromEntries(
    ['PolicyGuard.sol', 'TestHarness.sol'].map((name) => [
      name,
      { content: fs.readFileSync(path.join(process.cwd(), 'contracts', name), 'utf8') },
    ])
  );
  const output = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: 'Solidity',
        sources,
        settings: {
          optimizer: { enabled: true, runs: 200 },
          evmVersion: 'shanghai',
          outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
        },
      })
    )
  );
  const errors = (output.errors ?? []).filter((e: any) => e.severity === 'error');
  expect(errors).toEqual([]);
  for (const contracts of Object.values(output.contracts) as any[])
    for (const [name, artifact] of Object.entries(contracts) as [string, any][])
      artifacts[name] = { abi: artifact.abi, bytecode: `0x${artifact.evm.bytecode.object}` };
  const outputDir = path.join(process.cwd(), '.local', 'artifacts');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, 'PolicyGuard.json'),
    JSON.stringify(
      { compiler: solc.version(), evmVersion: 'shanghai', ...artifacts.PolicyGuard },
      null,
      2
    )
  );
}, 30000);
beforeEach(async () => {
  timestamp = 1791374400n;
  vm = await createVM({ common: new Common({ chain: Mainnet, hardfork: Hardfork.Shanghai }) });
  for (const user of [OWNER, AGENT, ATTACKER])
    await vm.stateManager.putAccount(createAddressFromString(user), new Account(0n, MON('10000')));
  quote = await deploy('TestQuoteToken');
  market = await deploy('TestKuruMarket', [quote]);
  guard = await deploy('PolicyGuard', [
    AGENT,
    market,
    quote,
    MON('300'),
    MON('500'),
    MON('800'),
    timestamp + 5n * 86400n,
  ]);
  const funding = await vm.evm.runCall({
    caller: createAddressFromString(OWNER),
    to: createAddressFromString(guard),
    value: MON('2000'),
    gasLimit: 100000n,
    block: block(),
  });
  expect(funding.execResult.exceptionError).toBeUndefined();
});
describe('PolicyGuard compiled Solidity executed in the EVM', () => {
  it('executes exact MON budget and measures real quote balance with fixed FOK flags', async () => {
    const result = await sell();
    expect(result.execResult.exceptionError).toBeUndefined();
    expect(await read(guard, 'PolicyGuard', 'totalSoldWei')).toBe(MON('200'));
    expect(await read(guard, 'PolicyGuard', 'daySoldWei')).toBe(MON('200'));
    expect(await read(guard, 'PolicyGuard', 'executionNonce')).toBe(1n);
    expect(await read(quote, 'TestQuoteToken', 'balanceOf', [guard])).toBe(4000000n);
    expect(await read(market, 'TestKuruMarket', 'lastIsFOK')).toBe(true);
    expect(await read(market, 'TestKuruMarket', 'lastIsMargin')).toBe(false);
    expect(await read(market, 'TestKuruMarket', 'lastValue')).toBe(MON('200'));
  });
  it('blocks unauthorized agents and does not change spending', async () => {
    await mustRevert(await sell(ATTACKER), 'Agent only');
    expect(await read(guard, 'PolicyGuard', 'totalSoldWei')).toBe(0n);
  });
  it('blocks per-transaction spend derived from actual size rather than supplied USD', async () => {
    await mustRevert(await sell(AGENT, 4000000000000n), 'Transaction budget');
    expect(await read(guard, 'PolicyGuard', 'totalSoldWei')).toBe(0n);
  });
  it('blocks daily spend, resets at UTC day rollover, and retains total budget', async () => {
    expect((await sell()).execResult.exceptionError).toBeUndefined();
    expect((await sell()).execResult.exceptionError).toBeUndefined();
    await mustRevert(await sell(), 'Daily budget');
    timestamp += 86400n;
    expect((await sell()).execResult.exceptionError).toBeUndefined();
    expect(await read(guard, 'PolicyGuard', 'daySoldWei')).toBe(MON('200'));
    expect(await read(guard, 'PolicyGuard', 'totalSoldWei')).toBe(MON('600'));
  });
  it('enforces lifetime native cap across multiple days', async () => {
    await sell();
    await sell();
    timestamp += 86400n;
    await sell();
    await sell();
    timestamp += 86400n;
    await mustRevert(await sell(), 'Total budget');
    expect(await read(guard, 'PolicyGuard', 'totalSoldWei')).toBe(MON('800'));
  });
  it('allows agent pause and only owner unpause', async () => {
    expect(
      (await invoke(guard, 'PolicyGuard', 'emergencyPause', [], AGENT)).execResult.exceptionError
    ).toBeUndefined();
    await mustRevert(await sell(), 'paused');
    await mustRevert(await invoke(guard, 'PolicyGuard', 'unpause', [], AGENT), 'Owner only');
    expect(
      (await invoke(guard, 'PolicyGuard', 'unpause')).execResult.exceptionError
    ).toBeUndefined();
    expect((await sell()).execResult.exceptionError).toBeUndefined();
  });
  it('blocks expired mandates and expired proposals', async () => {
    await mustRevert(
      await invoke(
        guard,
        'PolicyGuard',
        'executeMarketSell',
        [SIZE, 3900000n, timestamp - 1n],
        AGENT
      ),
      'expired'
    );
    timestamp += 5n * 86400n;
    await mustRevert(await sell(), 'expired');
  });
  it('rejects invalid zero output limits and below-market size', async () => {
    await mustRevert(await sell(AGENT, SIZE, 0n), 'Invalid order');
    await mustRevert(await sell(AGENT, 1n), 'Invalid order');
  });
  it('rolls back native budgets and quote balances when venue execution fails', async () => {
    await invoke(market, 'TestKuruMarket', 'configure', [true, false, false]);
    await mustRevert(await sell(), 'Test venue failure');
    expect(await read(guard, 'PolicyGuard', 'totalSoldWei')).toBe(0n);
    expect(await read(guard, 'PolicyGuard', 'executionNonce')).toBe(0n);
    expect(await read(quote, 'TestQuoteToken', 'balanceOf', [guard])).toBe(0n);
  });
  it('detects actual under-delivery even when market returns a plausible output', async () => {
    await invoke(market, 'TestKuruMarket', 'configure', [false, true, false]);
    await mustRevert(await sell(), 'Measured output');
    expect(await read(guard, 'PolicyGuard', 'totalSoldWei')).toBe(0n);
    expect(await read(quote, 'TestQuoteToken', 'balanceOf', [guard])).toBe(0n);
  });
  it('blocks recursive execution by an authorized contract agent', async () => {
    await invoke(guard, 'PolicyGuard', 'setAgent', [market]);
    await invoke(market, 'TestKuruMarket', 'configure', [false, false, true]);
    const result = await invoke(market, 'TestKuruMarket', 'invokeGuard', [
      guard,
      SIZE,
      3900000n,
      timestamp + 60n,
    ]);
    expect(result.execResult.exceptionError).toBeUndefined();
    expect(await read(market, 'TestKuruMarket', 'reentrySucceeded')).toBe(false);
    expect(await read(guard, 'PolicyGuard', 'executionNonce')).toBe(1n);
  });
  it('blocks agent withdrawals and revoked agent while allowing owner asset recovery', async () => {
    await mustRevert(
      await invoke(guard, 'PolicyGuard', 'withdrawNative', [ATTACKER, MON('1')], AGENT),
      'Owner only'
    );
    await invoke(guard, 'PolicyGuard', 'setAgent', [ATTACKER]);
    await mustRevert(await sell(AGENT), 'Agent only');
    expect((await sell(ATTACKER)).execResult.exceptionError).toBeUndefined();
    await mustRevert(
      await invoke(guard, 'PolicyGuard', 'withdrawQuote', [AGENT, 1n], AGENT),
      'Owner only'
    );
    expect(
      (await invoke(guard, 'PolicyGuard', 'withdrawQuote', [OWNER, 4000000n])).execResult
        .exceptionError
    ).toBeUndefined();
    expect(await read(quote, 'TestQuoteToken', 'balanceOf', [OWNER])).toBe(4000000n);
  });
  it('rejects deployment against a non-contract venue', async () => {
    await expect(
      deploy('PolicyGuard', [
        AGENT,
        ATTACKER,
        quote,
        MON('300'),
        MON('500'),
        MON('800'),
        timestamp + 86400n,
      ])
    ).rejects.toThrow('deployment failed');
  });
});
