#!/usr/bin/env bash

# Test CI Pipeline Locally
# This script replicates the GitHub workflow steps to catch issues before pushing

set -euo pipefail  # Exit on any error, unset var, or pipefail

echo "🚀 Testing CI pipeline locally..."
echo

# Check if we're in the right directory
if [[ ! -f "backend/go.mod" || ! -f "web-ui/package.json" ]]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

# Choose a reliable way to run pnpm that works on macOS where Corepack may fail
# Prefer npx with an explicit pnpm version to avoid Corepack signature issues
if command -v npx >/dev/null 2>&1; then
  PNPM_CMD=("npx" "-y" "pnpm@9")
elif command -v pnpm >/dev/null 2>&1; then
  PNPM_CMD=("pnpm")
else
  echo "❌ Error: Neither npx nor pnpm is available. Please install Node.js (with npm) or pnpm."
  exit 1
fi

# Show the pnpm version used
"${PNPM_CMD[@]}" --version || true

echo "📦 Installing frontend dependencies..."
cd web-ui
"${PNPM_CMD[@]}" install
echo "✅ Frontend dependencies installed"
echo

echo "🔍 Type-checking frontend..."
"${PNPM_CMD[@]}" run typecheck
echo "✅ Frontend type-check passed"
echo

echo "🏗️  Building frontend..."
"${PNPM_CMD[@]}" run build
echo "✅ Frontend build completed"
echo

echo "🧪 Running backend tests..."
cd ../backend
go test ./...
echo "✅ Backend tests passed"
echo

echo "🎉 All CI steps passed! Your changes should pass the GitHub workflow."
