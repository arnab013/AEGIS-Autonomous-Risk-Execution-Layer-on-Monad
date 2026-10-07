# Optional PolicyGuard vault

The current application signs direct native MON sales through a browser wallet. This contract is a separate, optional custody path. It has **not** been deployed or audited, and it does not secure the direct wallet path.

PolicyGuard accepts funding only from its owner, binds one immutable Kuru native-MON/USDC market, and lets one chosen agent invoke only `executeMarketSell`. Per-transaction, UTC-day, and lifetime budgets use actual native wei derived from Kuru's size precision. The agent cannot supply a fake USD notional, choose arbitrary calldata, approve unrelated tokens, or withdraw funds. Pause and expiry stop execution; only the owner can resume or withdraw. Quote output is measured from the vault's actual token balance. Every market sell fixes direct delivery and fill-or-kill. Reverts roll back spend counters.

Contract expiry and proposal deadline are Unix seconds. Native budgets use 18-decimal wei and quote minimums use USDC's 6-decimal atomic units. The browser adapter's direct Kuru route enforces a 30-second preflight expiry; Kuru's direct sell function has no deadline argument, so a wallet approval delayed beyond that period can still broadcast. Only the on-chain minimum output and fill-or-kill constraints remain enforced after direct wallet submission. A receipt means observed block inclusion, not a separately measured finality guarantee.

These native-unit budgets are not a dollar price cap, portfolio exposure cap, oracle, or guarantee of a good execution price. The authorized agent still chooses a positive minimum quote output. A production deployment needs an independently reviewed quote/oracle policy, exact source/ABI verification for its market deployment, operational key security, and external contract review.

Official sources used:

- [Kuru deployment addresses](https://docs.kuru.io/contracts/Contract-addresses)
- [Kuru OrderBook contract documentation](https://docs.kuru.io/contracts/OrderBook)
- [Official SDK ABI](https://github.com/Kuru-Labs/kuru-sdk/blob/main/abi/OrderBook.json)
- [Official SDK amount encoding](https://github.com/Kuru-Labs/kuru-sdk/blob/main/src/market/ioc.ts)
- [Official SDK L2 and AMM decoding](https://github.com/Kuru-Labs/kuru-sdk/blob/main/src/market/orderBook.ts)
- [Monad network information](https://docs.monad.xyz/developer-essentials/network-information)

ABI caution: Kuru's prose documentation lists uint96 minimum-output parameters, while the verified SDK ABI and market selectors use uint256. The adapter uses the exact SDK ABI. Market metadata and deployed code are checked at the configured chain before use. Testnet's official market currently has no bid liquidity, so a native-MON sell proposal correctly fails there. Mainnet observations and wallet proposals are kept on chain 143.

No deployment transaction has been submitted. Do not fund a deployment until its address, agent, limits, expiry, and market metadata have been reviewed.

Contract tests use the actual Solidity compiler and EVM, with test-only market/token contracts in `TestHarness.sol`. They do not run a TypeScript reimplementation of PolicyGuard. The test toolchain is pinned in `contracts/toolchain/package-lock.json` and installed separately into `.local/contract-tools`:

```powershell
. ./scripts/setup_env.ps1
node scripts/setup-contract-tools.mjs
npm test
```

The guard suite compiles Solidity for the Shanghai EVM and runs permission, typed size, transaction/day/lifetime budget, expiry, pause, actual output, venue failure rollback, owner withdrawal, and recursive execution tests. These are local EVM tests, not a fork of deployed Monad contracts or an external audit. The compiled guard ABI and bytecode artifact are written to `.local/artifacts/PolicyGuard.json`. TestHarness contracts must never be deployed or presented as live Kuru integrations.
