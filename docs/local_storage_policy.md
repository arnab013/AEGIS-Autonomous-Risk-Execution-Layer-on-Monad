# Local storage

Run `. .\scripts\setup_env.ps1` in PowerShell before installing dependencies, building or testing. The script derives paths from the checkout and places tool caches, temporary files and generated artifacts under `.local/`. The current Windows helpers require the checkout to be outside C:.

| Location | Contents |
| --- | --- |
| `node_modules/` | Installed dependencies |
| `dist/` | Production frontend |
| `.local/artifacts/` | Build and verification artifacts |
| `.local/artifacts/audit/` | Local hash-linked journal and exports |
| `.local/artifacts/ai/` | Local persistent AI accounting |
| `.local/contract-tools/` | Solidity test tools |
| `.local/tmp/`, `.local/cache/` | Temporary files and caches |
| `.env` | Server-only local configuration |

These paths are ignored by Git. Preserve an existing `.env`; never put provider credentials in browser variables, source files or public assets. Aegis does not need a wallet seed phrase or private key.

`npm run verify:storage` checks the process environment and explicit output paths. It is a path audit, not an OS-wide filesystem trace. The hosted app keeps conversations, policies, user-entered keys and journal entries in session memory; its durable AI ledger is separate.
