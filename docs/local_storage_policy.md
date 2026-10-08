# Storage policy

All intentional project writes must stay under F:\Projects\Monad Metropolis, including generated files, caches and tool state. Existing files on C: may be read. Unrelated files must not be moved or deleted.

Source the environment script in the same PowerShell session as project commands:

```powershell
Set-Location 'F:\Projects\Monad Metropolis'
. .\scripts\setup_env.ps1
$env:TEMP
$env:npm_config_cache
$env:USERPROFILE
npm config get cache
```

Check that write paths resolve inside the project. The script derives the root from its location, rejects C:, creates .local directories and sets process variables. It does not alter machine settings, HOME or CODEX_HOME.

| Purpose                                | Destination under .local                         |
| -------------------------------------- | ------------------------------------------------ |
| TEMP, TMP, TMPDIR                      | tmp                                              |
| XDG cache/config/data and user profile | cache and home                                   |
| APPDATA / LOCALAPPDATA                 | home/AppData                                     |
| npm, Yarn, Corepack, pnpm              | npm-cache, yarn-cache, node/corepack, pnpm-store |
| Python, pip and model caches           | python and named cache directories               |
| Cargo/Rust, Go, Gradle, Foundry        | Named tool directories                           |
| Playwright downloads                   | playwright; automatic browser download disabled  |
| Jupyter                                | jupyter                                          |

Check each new tool's documented storage behavior; environment variables do not prove it honors the paths. App launchers also redirect core child-process caches/temp files. Contract tools use the project-local setup command.

Dependencies go in node_modules, frontend builds in dist, and other artifacts in .local. Journal/export files use .local/artifacts/audit; the active journal rotates after exceeding 5 MiB. These directories and .env are ignored by Git. Run npm run verify:storage for the configured path audit; it is not an OS-wide filesystem trace.

Preserve existing .env contents and keep keys out of browser bundles, commits, screenshots and exports. Wallet signing needs no private key or seed phrase in the project.

An existing browser keeps its own profile. Verify F: paths before installing a browser or creating a profile. The app exports through its server, so it does not use the browser's default Downloads folder. Save manual screenshots/videos under this project too.

MetaMask Agent Wallet and other new tools may default to user-profile state; verify config, plugins, caches and outputs before using them. Do not change global cache settings or use system variables as temporary script variables.

Cleanup is limited to known disposable project directories. Resolve recursive deletion/move targets to absolute paths and confirm they remain inside the intended F: directory. Preserve source, secrets, submission evidence and necessary journal records.
