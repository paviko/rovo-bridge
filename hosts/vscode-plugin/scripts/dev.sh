#!/bin/bash

# VSCode Extension Development Workflow Script
# This script provides common development tasks for the RovoBridge VSCode extension

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

echo -e "${BLUE}RovoBridge VSCode Extension Development Script${NC}"

# --- Package manager helpers (macOS-friendly, avoid Corepack issues) ---
# Chooses pnpm via npx using the version from package.json when possible;
# falls back to global pnpm, then npm. Provides run helpers with fallback.
PNPM_RUN=""
RUN_PM="npm run"
INSTALL_PM="npm ci || npm install"

choose_pm() {
    # Determine preferred pnpm version from package.json's packageManager
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
    # Usage: run_script <scriptName>
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

# Change to plugin directory
cd "$PLUGIN_DIR"

# Function to show help
show_help() {
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  setup         Set up development environment"
    echo "  build         Build the extension for development"
    echo "  watch         Start TypeScript compiler in watch mode"
    echo "  test          Run all tests"
    echo "  test:watch    Run tests in watch mode"
    echo "  lint          Run linter"
    echo "  lint:fix      Run linter with auto-fix"
    echo "  clean         Clean build artifacts"
    echo "  package       Create development package"
    echo "  install       Install the development package in VSCode"
    echo "  uninstall     Uninstall the extension from VSCode"
    echo "  logs          Show VSCode extension logs"
    echo "  debug         Start debugging session"
    echo ""
    echo "Examples:"
    echo "  $0 setup              # Initial setup"
    echo "  $0 build              # Build for development"
    echo "  $0 test               # Run tests"
    echo "  $0 package && $0 install  # Package and install"
}

# Parse command
COMMAND="$1"
shift || true

case "$COMMAND" in
    "setup")
        print_status "Setting up development environment..."
        
        # Install dependencies
        print_status "Installing dependencies..."
        if ! command -v node >/dev/null 2>&1; then
            print_error "Node.js is required but not found in PATH. Please install Node.js."
            exit 1
        fi
        run_install
        
        # Install vsce if not present
        if ! command -v vsce &> /dev/null; then
            print_status "Installing vsce..."
            pnpm run install:vsce
        fi
        
        print_status "Development environment setup complete!"
        ;;
        
    "build")
        print_status "Building extension for development..."
        run_script compile
        print_status "Build complete!"
        ;;
        
    "watch")
        print_status "Starting TypeScript compiler in watch mode..."
        print_status "Press Ctrl+C to stop watching"
        run_script watch
        ;;
        
    "test")
        print_status "Running tests..."
        run_script test
        ;;
        
    "test:watch")
        print_status "Running tests in watch mode..."
        print_status "Press Ctrl+C to stop watching"
        # Note: VSCode test framework doesn't have built-in watch mode
        # This is a simple implementation using inotify-tools if available
        if command -v inotifywait &> /dev/null; then
            while true; do
                run_script test
                print_status "Waiting for file changes..."
                inotifywait -r -e modify,create,delete src/ --timeout 30 || true
            done
        else
            print_warning "inotify-tools not found. Running tests once."
            run_script test
        fi
        ;;
        
    "lint")
        print_status "Running linter..."
        run_script lint
        ;;
        
    "lint:fix")
        print_status "Running linter with auto-fix..."
        npx eslint src --ext ts --fix
        ;;
        
    "clean")
        print_status "Cleaning build artifacts..."
        run_script clean
        ;;
        
    "package")
        print_status "Creating development package..."
        ./scripts/build.sh --skip-tests
        ;;
        
    "install")
        print_status "Installing extension in VSCode..."
        
        # Find the most recent .vsix file
        VSIX_FILE=$(ls -t *.vsix 2>/dev/null | head -n1)
        
        if [ -z "$VSIX_FILE" ]; then
            print_error "No .vsix file found. Run '$0 package' first."
            exit 1
        fi
        
        print_status "Installing $VSIX_FILE..."
        if ! command -v code >/dev/null 2>&1; then
            print_error "VSCode 'code' CLI not found in PATH. On macOS, open VSCode and run: 'Shell Command: Install \"code\" command in PATH' from Command Palette."
            exit 1
        fi
        code --install-extension "$VSIX_FILE" --force
        print_status "Extension installed! Restart VSCode to use the updated extension."
        ;;
        
    "uninstall")
        print_status "Uninstalling extension from VSCode..."
        code --uninstall-extension rovobridge.rovobridge || {
            print_warning "Extension may not be installed or publisher name differs"
        }
        ;;
        
    "logs")
        print_status "Opening VSCode extension logs..."
        print_status "Extension logs location:"
        
        # Different paths for different OS
        if [[ "$OSTYPE" == "darwin"* ]]; then
            LOG_PATH="$HOME/Library/Application Support/Code/logs"
        elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
            LOG_PATH="$HOME/.config/Code/logs"
        else
            LOG_PATH="Unknown for this OS"
        fi
        
        echo "  $LOG_PATH"
        print_status "You can also use 'Developer: Show Logs...' from VSCode Command Palette"
        ;;
        
    "debug")
        print_status "Starting debugging session..."
        print_status "1. Open this project in VSCode"
        print_status "2. Go to Run and Debug (Ctrl+Shift+D)"
        print_status "3. Select 'Run Extension' configuration"
        print_status "4. Press F5 to start debugging"
        print_status ""
        print_status "Or run: code . && code --command workbench.action.debug.start"
        ;;
        
    "help"|"--help"|"-h"|"")
        show_help
        ;;
        
    *)
        print_error "Unknown command: $COMMAND"
        echo ""
        show_help
        exit 1
        ;;
esac