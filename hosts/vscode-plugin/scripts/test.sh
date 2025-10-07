#!/bin/bash

# VSCode Extension Test Runner Script
# This script provides convenient ways to run tests

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
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
if [ ! -f "package.json" ]; then
    print_error "package.json not found. Please run this script from the VSCode plugin directory."
    exit 1
fi

# Parse command line arguments
COMMAND=${1:-"test"}

case $COMMAND in
    "test" | "t")
        print_status "Running full test suite..."
        pnpm test
        ;;
    "compile" | "c")
        print_status "Compiling TypeScript..."
        pnpm run compile
        ;;
    "lint" | "l")
        print_status "Running ESLint..."
        pnpm run lint
        ;;
    "lint-fix" | "lf")
        print_status "Running ESLint with auto-fix..."
        npx eslint src --ext ts --fix
        ;;
    "watch" | "w")
        print_status "Starting watch mode..."
        pnpm run watch
        ;;
    "clean")
        print_status "Cleaning build outputs..."
        rm -rf out/
        rm -rf .vscode-test/
        print_status "Clean complete"
        ;;
    "install" | "i")
        print_status "Installing dependencies..."
        pnpm install
        ;;
    "help" | "h" | "--help")
        echo "VSCode Extension Test Runner"
        echo ""
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  test, t       Run full test suite (default)"
        echo "  compile, c    Compile TypeScript only"
        echo "  lint, l       Run ESLint only"
        echo "  lint-fix, lf  Run ESLint with auto-fix"
        echo "  watch, w      Start TypeScript watch mode"
        echo "  clean         Clean build outputs"
        echo "  install, i    Install dependencies"
        echo "  help, h       Show this help message"
        echo ""
        echo "Examples:"
        echo "  $0 test       # Run all tests"
        echo "  $0 compile    # Just compile"
        echo "  $0 lint-fix   # Fix linting issues"
        ;;
    *)
        print_error "Unknown command: $COMMAND"
        print_warning "Use '$0 help' to see available commands"
        exit 1
        ;;
esac