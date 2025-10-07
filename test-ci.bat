@echo off
setlocal enabledelayedexpansion

REM Test CI Pipeline Locally
REM This script replicates the GitHub workflow steps to catch issues before pushing

echo 🚀 Testing CI pipeline locally...
echo.

REM Check if we're in the right directory
if not exist "backend\go.mod" (
    echo ❌ Error: Please run this script from the project root directory
    exit /b 1
)
if not exist "web-ui\package.json" (
    echo ❌ Error: Please run this script from the project root directory
    exit /b 1
)

echo 📦 Installing frontend dependencies...
cd web-ui
pnpm install
if !errorlevel! neq 0 (
    echo ❌ Frontend dependency installation failed
    exit /b 1
)
echo ✅ Frontend dependencies installed
echo.

echo 🔍 Type-checking frontend...
pnpm run typecheck
if !errorlevel! neq 0 (
    echo ❌ Frontend type-check failed
    exit /b 1
)
echo ✅ Frontend type-check passed
echo.

echo 🏗️  Building frontend...
pnpm run build
if !errorlevel! neq 0 (
    echo ❌ Frontend build failed
    exit /b 1
)
echo ✅ Frontend build completed
echo.

echo 🧪 Running backend tests...
cd ..\backend
go test ./...
if !errorlevel! neq 0 (
    echo ❌ Backend tests failed
    exit /b 1
)
echo ✅ Backend tests passed
echo.

echo 🎉 All CI steps passed! Your changes should pass the GitHub workflow.