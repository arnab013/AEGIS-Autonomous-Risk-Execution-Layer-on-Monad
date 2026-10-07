# Project-local storage policy

The user's instruction is strict: all intentional project writes, generated files, caches and tool state must remain inside `F:\Projects\Monad Metropolis`. Reading existing files on C: is allowed. This policy does not authorize deleting or moving unrelated files.

Before running project commands, dot-source the provided environment script in the same PowerShell session:

~~~powershell
Set-Location 'F:\Projects\Monad Metropolis'
. .\scripts\setup_env.ps1
$env:TEMP
$env:npm_config_cache
$env:USERPROFILE
npm config get cache
~~~

Each displayed write path must resolve inside the project. The script derives the root from its own location and rejects a C: project root. It creates project-local storage directories and sets process environment variables. It does not change the machine's permanent configuration, HOME or CODEX_HOME.

## Redirected paths

| Tool or purpose | Project destination |
| --- | --- |
| TEMP, TMP, TMPDIR | .local/tmp |
| XDG cache/config/data and user profile | .local/cache and .local/home |
| APPDATA / LOCALAPPDATA | .local/home/AppData |
| npm, Yarn, Corepack, pnpm | .local/npm-cache, yarn-cache, node/corepack, pnpm-store |
| Python bytecode, pip, model libraries | .local/python and named model/cache directories |
| Cargo/Rust, Go, Gradle, Foundry | Named directories under .local |
| Playwright browser downloads | .local/playwright; automatic browser download disabled |
| Jupyter configuration and runtime | .local/jupyter |

These redirects are preparation, not proof that an arbitrary tool honors them. Check a new tool's documented storage behavior before invoking it. The existing app launchers also set core temporary/cache paths for their child processes.

Source dependencies belong in node_modules, compiled frontend output in dist, and logs/verification artifacts under .local. The API journal and exports are under .local/artifacts/audit. Journal rotation occurs after the active file exceeds 5 MiB. Dependencies, dist, .local and .env are ignored by Git.

## Secrets and external applications

Preserve an existing .env; never overwrite it with the example. Keep TypeSafe keys server-only. Do not print secrets or place them in screenshots, browser bundles, exported evidence or commit history. The wallet path needs no private key or seed phrase.

An already-running browser has its own profile outside this shell's environment. Do not initiate browser installation or create a new profile until its storage path is verified on F:. The application exports through its server to the project artifact directory, avoiding the browser's default Downloads directory. If manually saving screenshots or videos, explicitly select a path under this project.

Optional MetaMask Agent Wallet, blockchain compilers, ML tools and similar runtimes may default to user-profile storage. They are not needed to run this MVP. Verify all config, plugin, state and cache locations before enabling them. A configured variable alone does not establish where a tool actually writes.

## Verification and cleanup

Before an install or generation command, check its output and cache locations, then keep artifacts under a named .local subdirectory. Do not repurpose common system variables as temporary script variables or modify global cache/config settings.

Cleanup is limited to known disposable project directories. Resolve every deletion or move target to an absolute path and verify it remains inside the intended F: workspace before any recursive operation. Preserve source, the existing environment file, evidence and journal records needed for submission.
