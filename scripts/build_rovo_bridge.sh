#!/usr/bin/env bash
set -euo pipefail

# Build rovo-bridge for multiple platforms and place binaries in both JetBrains and VSCode plugin resources.
# JetBrains Targets:
# - windows/amd64 -> hosts/jetbrains-plugin/src/main/resources/bin/windows/amd64/rovo-bridge.exe
# - darwin/arm64  -> hosts/jetbrains-plugin/src/main/resources/bin/macos/arm64/rovo-bridge
# - darwin/amd64  -> hosts/jetbrains-plugin/src/main/resources/bin/macos/amd64/rovo-bridge
# - linux/amd64   -> hosts/jetbrains-plugin/src/main/resources/bin/linux/amd64/rovo-bridge
# - linux/arm64   -> hosts/jetbrains-plugin/src/main/resources/bin/linux/arm64/rovo-bridge
# VSCode Targets:
# - windows/amd64 -> hosts/vscode-plugin/resources/bin/windows/amd64/rovo-bridge.exe
# - darwin/arm64  -> hosts/vscode-plugin/resources/bin/macos/arm64/rovo-bridge
# - darwin/amd64  -> hosts/vscode-plugin/resources/bin/macos/amd64/rovo-bridge
# - linux/amd64   -> hosts/vscode-plugin/resources/bin/linux/amd64/rovo-bridge
# - linux/arm64   -> hosts/vscode-plugin/resources/bin/linux/arm64/rovo-bridge

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
JETBRAINS_OUT_BASE="$ROOT_DIR/hosts/jetbrains-plugin/src/main/resources/bin"
VSCODE_OUT_BASE="$ROOT_DIR/hosts/vscode-plugin/resources/bin"

UI_DIR="$ROOT_DIR/web-ui"

if [[ ! -d "$BACKEND_DIR" ]]; then
  echo "Error: backend directory not found at $BACKEND_DIR" >&2
  exit 1
fi

# Map GOOS/GOARCH -> output paths (portable: no associative arrays)
# Note: 'darwin' maps to 'macos' directory naming per README.
# Format: GOOS/GOARCH::jetbrains_path::vscode_path
TARGET_LIST="
windows/amd64::$JETBRAINS_OUT_BASE/windows/amd64/rovo-bridge.exe::$VSCODE_OUT_BASE/windows/amd64/rovo-bridge.exe
darwin/arm64::$JETBRAINS_OUT_BASE/macos/arm64/rovo-bridge::$VSCODE_OUT_BASE/macos/arm64/rovo-bridge
darwin/amd64::$JETBRAINS_OUT_BASE/macos/amd64/rovo-bridge::$VSCODE_OUT_BASE/macos/amd64/rovo-bridge
linux/amd64::$JETBRAINS_OUT_BASE/linux/amd64/rovo-bridge::$VSCODE_OUT_BASE/linux/amd64/rovo-bridge
linux/arm64::$JETBRAINS_OUT_BASE/linux/arm64/rovo-bridge::$VSCODE_OUT_BASE/linux/arm64/rovo-bridge
"

# Allow filtering targets via env var: ONLY="linux/amd64 darwin/arm64"
ONLY_TARGETS=${ONLY:-}

build_ui() {
  if [[ "${SKIP_UI_BUILD:-0}" == "1" ]]; then
    echo "SKIP_UI_BUILD=1 -> skipping web UI build"
    return
  fi
  if [[ ! -d "$UI_DIR" ]]; then
    echo "Warning: UI dir not found at $UI_DIR; skipping UI build" >&2
    return
  fi
  echo "=> Building web UI (Vite)"
  (
    cd "$UI_DIR"
    # Choose package manager
    if [[ -f pnpm-lock.yaml ]]; then
      echo "Using pnpm (pnpm-lock.yaml found)"
      # Avoid Corepack due to signature verification issues.
      # Prefer a local pnpm; otherwise use npx to fetch a pinned pnpm version from package.json.
      # Fallback to npm if neither pnpm nor npx is available.
      PNPM_VERSION="$(node -p "try{(require('./package.json').packageManager||'').split('@')[1]||''}catch(e){''}" 2>/dev/null || true)"
      [[ -z "${PNPM_VERSION}" ]] && PNPM_VERSION="9.0.0"

      if command -v npx >/dev/null 2>&1; then
        # Prefer npx to avoid Corepack shims
        PNPM_RUN="npx -y pnpm@${PNPM_VERSION}"
      elif command -v pnpm >/dev/null 2>&1; then
        # Fallback to a globally installed pnpm (may still be a Corepack shim)
        PNPM_RUN="pnpm"
      else
        echo "pnpm/npx not found; falling back to npm" >&2
        npm ci || npm install
        npm run build:debug
        exit 0
      fi

      # Try pnpm first; on failure, fall back to npm
      set +e
      ${PNPM_RUN} install --frozen-lockfile
      install_status=$?
      if [[ $install_status -ne 0 ]]; then
        echo "pnpm install failed with exit code $install_status; falling back to npm" >&2
        npm ci || npm install
        npm run build:debug
        set -e
        exit 0
      fi
      ${PNPM_RUN} run build:debug
      build_status=$?
      set -e
      if [[ $build_status -ne 0 ]]; then
        echo "pnpm build failed with exit code $build_status; falling back to npm" >&2
        npm ci || npm install
        npm run build:debug
        exit 0
      fi
    elif [[ -f package-lock.json ]]; then
      echo "Using npm (package-lock.json found)"
      npm ci
      npm run build:debug
    elif [[ -f yarn.lock ]]; then
      echo "Using yarn (yarn.lock found)"
      yarn install --frozen-lockfile || yarn install
      yarn run build:debug
    else
      echo "No lockfile found, defaulting to npm"
      npm install
      npm run build:debug
    fi
  )
}

build_one() {
  local goos="$1" goarch="$2" jetbrains_out="$3" vscode_out="$4"
  echo "=> Building $goos/$goarch -> JetBrains: $jetbrains_out, VSCode: $vscode_out"
  
  # Create directories for both outputs
  mkdir -p "$(dirname "$jetbrains_out")"
  mkdir -p "$(dirname "$vscode_out")"
  
  # Build the binary to a temporary location first
  local temp_binary="/tmp/rovo-bridge-$goos-$goarch"
  if [[ "$goos" == "windows" ]]; then
    temp_binary="${temp_binary}.exe"
  fi
  
  (
    cd "$BACKEND_DIR"
    CGO_ENABLED=0 GOOS="$goos" GOARCH="$goarch" \
      go build -trimpath -ldflags="-s -w" -o "$temp_binary" ./cmd/rovo-bridge
  )
  
  # Copy to both plugin locations
  cp "$temp_binary" "$jetbrains_out"
  cp "$temp_binary" "$vscode_out"
  
  # Ensure non-Windows binaries are executable
  if [[ "$goos" != "windows" ]]; then
    chmod +x "$jetbrains_out"
    chmod +x "$vscode_out"
  fi
  
  # Clean up temporary binary
  rm -f "$temp_binary"
}

# Loop through TARGET_LIST; if ONLY_TARGETS is set, filter accordingly
UNMATCHED=""
if [[ -n "$ONLY_TARGETS" ]]; then
  echo "Building only specified targets: $ONLY_TARGETS"
  UNMATCHED=" $ONLY_TARGETS "
fi

# Build UI first unless explicitly skipped
build_ui

while IFS= read -r entry; do
  # skip empty lines
  [[ -z "$entry" ]] && continue

  # Parse key and output paths: key is GOOS/GOARCH
  key=${entry%%::*}
  remainder=${entry#*::}
  jetbrains_out=${remainder%%::*}
  vscode_out=${remainder#*::}

  # Apply ONLY filter if provided
  if [[ -n "$ONLY_TARGETS" ]]; then
    match=0
    for only in $ONLY_TARGETS; do
      if [[ "$key" == "$only" ]]; then
        match=1
        # mark as matched
        UNMATCHED=${UNMATCHED// $key / }
        break
      fi
    done
    [[ $match -eq 0 ]] && continue
  fi

  IFS=/ read -r goos goarch <<< "$key"
  build_one "$goos" "$goarch" "$jetbrains_out" "$vscode_out"

done <<< "$TARGET_LIST"

# Warn about unknown ONLY entries
if [[ -n "$ONLY_TARGETS" ]]; then
  for miss in $(echo "$UNMATCHED"); do
    [[ -n "$miss" ]] && echo "Skipping unknown target: $miss" >&2
  done
fi

printf "\nAll done. Binaries placed under:\n"
printf "  JetBrains: %s\n" "$JETBRAINS_OUT_BASE"
printf "  VSCode: %s\n" "$VSCODE_OUT_BASE"
