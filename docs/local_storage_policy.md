# Local Storage & C-Drive Isolation Policy

## Invariant
**Strict No C: Drive Write Rule**: The Windows `C:` drive has critical storage constraints. Under no circumstances should any dependency, cache, temporary file, compiler, downloaded model, log, or build artifact be written to `C:\`.

All project data, dependencies, builds, artifacts, and caches **MUST** strictly reside within `PROJECT_ROOT` (`F:\Projects\Monad Metropolis`).

---

## Directory Layout in `PROJECT_ROOT/.local`

| Path | Redirected Purpose | Environment Variable(s) |
| :--- | :--- | :--- |
| `.local/tmp/` | Operating system temporary directory | `TEMP`, `TMP`, `TMPDIR` |
| `.local/cache/` | XDG generic user cache | `XDG_CACHE_HOME` |
| `.local/home/` | Emulated user profile / dotfiles | `HOME`, `USERPROFILE`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME` |
| `.local/logs/` | Project operational and execution logs | - |
| `.local/downloads/` | Programmatic downloads | - |
| `.local/npm-cache/` | Node Package Manager cache | `npm_config_cache`, `NPM_CONFIG_CACHE` |
| `.local/pnpm-store/` | PNPM package store | `PNPM_HOME` |
| `.local/yarn-cache/` | Yarn dependency cache | `YARN_CACHE_FOLDER` |
| `.local/python/pip-cache/` | Python PIP cache | `PIP_CACHE_DIR` |
| `.local/python/pycache/` | Python compiled bytecode (`.pyc`) | `PYTHONPYCACHEPREFIX` |
| `.local/huggingface/` | AI/ML models & tokenizer cache | `HF_HOME`, `HUGGINGFACE_HUB_CACHE`, `TRANSFORMERS_CACHE` |
| `.local/torch/` | PyTorch cache | `TORCH_HOME` |
| `.local/cuda-cache/` | Nvidia CUDA compilation cache | `CUDA_CACHE_PATH` |
| `.local/playwright/` | Browser binaries | `PLAYWRIGHT_BROWSERS_PATH` |
| `.local/rust/` | Rust / Cargo home | `CARGO_HOME`, `RUSTUP_HOME` |
| `.local/foundry/` | Solidity / Foundry binaries and cache | `FOUNDRY_DIR` |

---

## Execution Guardrails

1. **Before Running Any Command**:
   Source the environment configuration in PowerShell:
   ```powershell
   . .\scripts\setup_env.ps1
   ```
2. **Node / NPM**:
   - Always run `npm` with `--cache "F:\Projects\Monad Metropolis\.local\npm-cache"`.
   - Never install global modules (`npm i -g`).
3. **Python**:
   - Always use a project-local virtual environment located at `F:\Projects\Monad Metropolis\.venv`.
   - Always pass `--cache-dir "F:\Projects\Monad Metropolis\.local\python\pip-cache"` or `--no-cache-dir`.
4. **Git**:
   - All `.local/`, `.venv/`, `node_modules/`, and temporary build artifacts are ignored by `.gitignore`.
