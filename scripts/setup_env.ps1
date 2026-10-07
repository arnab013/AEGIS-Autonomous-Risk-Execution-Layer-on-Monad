# setup_env.ps1 - Environment variable redirection script
# Enforces strictly that NO project cache, temporary file, or toolchain data is written to C:
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir

# Verify not on C:
if ($projectRoot.ToUpper().StartsWith("C:\")) {
    Write-Error "CRITICAL ERROR: PROJECT_ROOT is on C:\ drive! Aborting."
    exit 1
}

Write-Host "Configuring Project-Local Environment at: $projectRoot"

$env:PROJECT_ROOT = $projectRoot
$localDir = Join-Path $projectRoot ".local"

# Generic Temp / Cache
$env:TEMP = Join-Path $localDir "tmp"
$env:TMP = Join-Path $localDir "tmp"
$env:TMPDIR = Join-Path $localDir "tmp"
$env:XDG_CACHE_HOME = Join-Path $localDir "cache"
$env:XDG_CONFIG_HOME = Join-Path $localDir "home/.config"
$env:XDG_DATA_HOME = Join-Path $localDir "home/.local/share"
$env:USERPROFILE = Join-Path $localDir "home"
$env:APPDATA = Join-Path $localDir "home/AppData/Roaming"
$env:LOCALAPPDATA = Join-Path $localDir "home/AppData/Local"

# Node / NPM / PNPM / Yarn
$env:npm_config_cache = Join-Path $localDir "npm-cache"
$env:NPM_CONFIG_CACHE = Join-Path $localDir "npm-cache"
$env:PNPM_HOME = Join-Path $localDir "pnpm-store"
$env:YARN_CACHE_FOLDER = Join-Path $localDir "yarn-cache"
$env:COREPACK_HOME = Join-Path $localDir "node/corepack"
$env:NODE_COMPILE_CACHE = Join-Path $localDir "node/compile-cache"

# Python / ML / AI
$env:PIP_CACHE_DIR = Join-Path $localDir "python/pip-cache"
$env:PYTHONPYCACHEPREFIX = Join-Path $localDir "python/pycache"
$env:HF_HOME = Join-Path $localDir "huggingface"
$env:HUGGINGFACE_HUB_CACHE = Join-Path $localDir "huggingface/hub"
$env:TRANSFORMERS_CACHE = Join-Path $localDir "huggingface/transformers"
$env:TORCH_HOME = Join-Path $localDir "torch"
$env:CUDA_CACHE_PATH = Join-Path $localDir "cuda-cache"
$env:NUMBA_CACHE_DIR = Join-Path $localDir "numba-cache"
$env:MPLCONFIGDIR = Join-Path $localDir "matplotlib"

# Rust / Cargo
$env:CARGO_HOME = Join-Path $localDir "rust/cargo"
$env:RUSTUP_HOME = Join-Path $localDir "rust/rustup"

# Go
$env:GOPATH = Join-Path $localDir "go"
$env:GOMODCACHE = Join-Path $localDir "go/pkg/mod"

# Java / Gradle
$env:GRADLE_USER_HOME = Join-Path $localDir "gradle"

# Foundry / Solidity
$env:FOUNDRY_DIR = Join-Path $localDir "foundry"

# Browser
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $localDir "playwright"
$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1"

# Jupyter
$env:JUPYTER_CONFIG_DIR = Join-Path $localDir "jupyter/config"
$env:JUPYTER_DATA_DIR = Join-Path $localDir "jupyter/data"
$env:JUPYTER_RUNTIME_DIR = Join-Path $localDir "jupyter/runtime"

$storageFolders = @(
    "tmp", "cache", "home", "logs", "downloads", "python", "node", "npm-cache",
    "pnpm-store", "yarn-cache", "huggingface", "torch", "cuda-cache", "numba-cache",
    "matplotlib", "jupyter", "playwright", "rust", "go", "gradle", "models", "build",
    "artifacts", "test-data", "home/AppData/Roaming", "home/AppData/Local"
)
foreach ($folder in $storageFolders) {
    $storagePath = Join-Path $localDir $folder
    New-Item -ItemType Directory -Force -Path $storagePath | Out-Null
}

Write-Host "Environment configured. All caches and temp files redirected to $localDir"
