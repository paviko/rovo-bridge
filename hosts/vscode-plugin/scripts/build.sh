#!/bin/bash

# VSCode Extension Build Script
# This script handles the complete build process for the RovoBridge VSCode extension

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$(dirname "$PLUGIN_DIR")")"

echo -e "${BLUE}RovoBridge VSCode Extension Build Script${NC}"
echo "Plugin directory: $PLUGIN_DIR"
echo "Root directory: $ROOT_DIR"

# --- Package manager helpers (macOS-friendly, avoid Corepack issues) ---
PNPM_RUN=""
RUN_PM="npm run"
INSTALL_PM="npm ci || npm install"

choose_pm() {
    local version
    version="$(node -p "try{(require('./package.json').packageManager||'').split('@')[1]?.split('+')[0]||''}catch(e){''}" 2>/dev/null || true)"
    [[ -z "$version" ]] && version="9.0.0"

    if [[ -f pnpm-lock.yaml ]]; then
        if command -v npx >/dev/null 2>&1; then
            PNPM_RUN="npx -y pnpm@${version}"
        elif command -v pnpm >/dev/null 2>&1; then
            PNPM_RUN="pnpm"
        else
            PNPM_RUN=""
        fi
    else
        PNPM_RUN=""
    fi

    if [[ -n "$PNPM_RUN" ]]; then
        RUN_PM="$PNPM_RUN run"
        INSTALL_PM="$PNPM_RUN install --frozen-lockfile"
    else
        RUN_PM="npm run"
        INSTALL_PM="npm ci || npm install"
    fi
}

run_install() {
    choose_pm
    if [[ -n "$PNPM_RUN" ]]; then
        set +e
        eval "$INSTALL_PM"
        local status=$?
        set -e
        if [[ $status -ne 0 ]]; then
            echo -e "${YELLOW}[WARN]${NC} pnpm install failed; falling back to npm"
            npm ci || npm install
        fi
    else
        npm ci || npm install
    fi
}

run_script() {
    local script="$1"
    choose_pm
    if [[ -n "$PNPM_RUN" ]]; then
        set +e
        eval "$RUN_PM $script"
        local status=$?
        set -e
        if [[ $status -ne 0 ]]; then
            echo -e "${YELLOW}[WARN]${NC} pnpm run $script failed; trying npm"
            npm run "$script"
        fi
    else
        npm run "$script"
    fi
}

# Function to print status
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "$PLUGIN_DIR/package.json" ]; then
    print_error "package.json not found. Please run this script from the VSCode plugin directory."
    exit 1
fi

# Parse command line arguments
BUILD_TYPE="development"
SKIP_BINARIES=false
SKIP_TESTS=false
PACKAGE_ONLY=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --production)
            BUILD_TYPE="production"
            shift
            ;;
        --skip-binaries)
            SKIP_BINARIES=true
            shift
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --package-only)
            PACKAGE_ONLY=true
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --production      Build for production (default: development)"
            echo "  --skip-binaries   Skip building backend binaries"
            echo "  --skip-tests      Skip running tests"
            echo "  --package-only    Only create the .vsix package (skip compilation)"
            echo "  --help           Show this help message"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

print_status "Building VSCode extension in $BUILD_TYPE mode"

# Change to plugin directory
cd "$PLUGIN_DIR"

# Step 1: Clean previous build artifacts
if [ "$PACKAGE_ONLY" = false ]; then
    print_status "Cleaning previous build artifacts..."
    set +e
    run_script clean
    if [[ $? -ne 0 ]]; then
        print_warning "Clean command failed, continuing..."
    fi
    set -e
fi

# Step 2: Install dependencies
if [ "$PACKAGE_ONLY" = false ]; then
    print_status "Installing dependencies..."
    if ! command -v node >/dev/null 2>&1; then
        print_error "Node.js is required but not found in PATH. Please install Node.js."
        exit 1
    fi
    run_install
fi

# Step 3: Build backend binaries
if [ "$SKIP_BINARIES" = false ] && [ "$PACKAGE_ONLY" = false ]; then
    print_status "Building backend binaries..."
    cd "$ROOT_DIR"
    if [ -f "./scripts/build_rovo_bridge.sh" ]; then
        ./scripts/build_rovo_bridge.sh
    else
        print_error "Backend build script not found at ./scripts/build_rovo_bridge.sh"
        exit 1
    fi
    cd "$PLUGIN_DIR"
fi

# Step 4: Compile TypeScript
if [ "$PACKAGE_ONLY" = false ]; then
    print_status "Compiling TypeScript..."
    if [ "$BUILD_TYPE" = "production" ]; then
        run_script compile:production
    else
        run_script compile
    fi
fi

# Step 5: Run linting
if [ "$PACKAGE_ONLY" = false ]; then
    print_status "Running linter..."
    set +e
    run_script lint
    if [[ $? -ne 0 ]]; then
        print_warning "Linting failed, continuing with build..."
    fi
    set -e
fi

# Step 6: Run tests
if [ "$SKIP_TESTS" = false ] && [ "$PACKAGE_ONLY" = false ]; then
    print_status "Running tests..."
    set +e
    run_script test
    if [[ $? -ne 0 ]]; then
        print_warning "Tests failed, continuing with build..."
    fi
    set -e
fi

# Step 7: Check for required binaries
print_status "Checking for required binaries..."
BINARY_PATHS=(
    "resources/bin/windows/amd64/rovo-bridge.exe"
    "resources/bin/macos/amd64/rovo-bridge"
    "resources/bin/macos/arm64/rovo-bridge"
    "resources/bin/linux/amd64/rovo-bridge"
    "resources/bin/linux/arm64/rovo-bridge"
)

MISSING_BINARIES=false
for binary_path in "${BINARY_PATHS[@]}"; do
    if [ ! -f "$binary_path" ]; then
        print_warning "Missing binary: $binary_path"
        MISSING_BINARIES=true
    fi
done

if [ "$MISSING_BINARIES" = true ]; then
    print_warning "Some binaries are missing. The extension may not work on all platforms."
    print_warning "Run './scripts/build_rovo_bridge.sh' from the root directory to build all binaries."
fi

# Step 8: Create package
print_status "Creating VSCode extension package..."

# Use vsce if available; otherwise prefer npx to avoid global installs
VSCE_CMD="vsce"
if ! command -v vsce >/dev/null 2>&1; then
    if command -v npx >/dev/null 2>&1; then
        VSCE_CMD="npx -y @vscode/vsce"
    else
        print_warning "vsce not found and npx unavailable; attempting global install via npm"
        npm install -g @vscode/vsce
    fi
fi

# Create the package
if [ "$BUILD_TYPE" = "production" ]; then
    eval "$VSCE_CMD package --out 'rovobridge-$(date +%Y%m%d-%H%M%S).vsix'"
else
    eval "$VSCE_CMD package --pre-release --out 'rovobridge-dev-$(date +%Y%m%d-%H%M%S).vsix'"
fi

print_status "Build completed successfully!"
print_status "Extension package created in: $PLUGIN_DIR"

# List created .vsix files (compatible with older macOS bash)
# Enable nullglob so that the pattern expands to nothing if there are no matches
shopt -s nullglob
VSIX_FILES=( *.vsix )
shopt -u nullglob

if [ ${#VSIX_FILES[@]} -gt 0 ]; then
    print_status "Available packages:"
    for vsix in "${VSIX_FILES[@]}"; do
        echo "  - $vsix"
    done

    # Pick the most recently modified .vsix (portable across bash versions)
    LATEST_VSIX="${VSIX_FILES[0]}"
    for f in "${VSIX_FILES[@]}"; do
        if [ "$f" -nt "$LATEST_VSIX" ]; then
            LATEST_VSIX="$f"
        fi
    done

    echo ""
    print_status "To install the extension:"
    echo "  code --install-extension \"$LATEST_VSIX\""
    echo ""
    print_status "To publish the extension:"
    echo "  vsce publish"
fi