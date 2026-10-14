# Attribution

Aegis is developed by **Arnab Saha** and released under the [MIT License](LICENSE).

## Project foundation

The supplied project already contained a React terminal, scenario fixtures, market and risk interfaces, and placeholder integration clients. Those components are pre-existing work. Their original commit history and dates are retained.

The subsequent implementation adds live Monad/Kuru reads, wallet balance reads, reviewed MON sale preparation, transaction tracking, server-side Jev integration and response validation, Scout chat, explicit action approvals, sponsored AI accounting, user-key access, paper accounting, stronger risk checks, evidence capture and the current interface.

## AI assistance

OpenAI Codex assisted with research, implementation, testing and documentation. The Aegis logo assets were created with OpenAI image generation. AI-assisted development does not establish an independent audit or trading performance.

## Dependencies and data

React, Vite, TypeScript, viem, Vitest and other packages retain their respective licenses. Exact package versions are recorded in package-lock.json and contracts/toolchain/package-lock.json.

Market and contract reads use Monad RPC and Kuru's MON/USDC contracts. The Kuru book reconstruction follows the SDK's integer arithmetic; relevant source links are retained beside the implementation. Jev assessments use TypeSafe. Scout uses the selected provider's API. News items link to their original CoinDesk or Decrypt source and retain publication dates. These services and publishers retain their respective rights.
