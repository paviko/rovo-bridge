@echo off
REM VSCode Extension Build Script for Windows
REM This script handles the complete build process for the RovoBridge VSCode extension

setlocal enabledelayedexpansion

REM Script directory
set "SCRIPT_DIR=%~dp0"
set "PLUGIN_DIR=%SCRIPT_DIR%.."
set "ROOT_DIR=%PLUGIN_DIR%\..\.."

echo RovoBridge VSCode Extension Build Script
echo Plugin directory: %PLUGIN_DIR%
echo Root directory: %ROOT_DIR%

REM Check if we're in the right directory
if not exist "%PLUGIN_DIR%\package.json" (
    echo [ERROR] package.json not found. Please run this script from the VSCode plugin directory.
    exit /b 1
)

REM Parse command line arguments
set "BUILD_TYPE=development"
set "SKIP_BINARIES=false"
set "SKIP_TESTS=false"
set "PACKAGE_ONLY=false"

:parse_args
if "%~1"=="" goto args_done
if "%~1"=="--production" (
    set "BUILD_TYPE=production"
    shift
    goto parse_args
)
if "%~1"=="--skip-binaries" (
    set "SKIP_BINARIES=true"
    shift
    goto parse_args
)
if "%~1"=="--skip-tests" (
    set "SKIP_TESTS=true"
    shift
    goto parse_args
)
if "%~1"=="--package-only" (
    set "PACKAGE_ONLY=true"
    shift
    goto parse_args
)
if "%~1"=="--help" (
    echo Usage: %0 [OPTIONS]
    echo Options:
    echo   --production      Build for production ^(default: development^)
    echo   --skip-binaries   Skip building backend binaries
    echo   --skip-tests      Skip running tests
    echo   --package-only    Only create the .vsix package ^(skip compilation^)
    echo   --help           Show this help message
    exit /b 0
)
echo [ERROR] Unknown option: %~1
exit /b 1

:args_done

echo [INFO] Building VSCode extension in %BUILD_TYPE% mode

REM Change to plugin directory
cd /d "%PLUGIN_DIR%"

REM Step 1: Clean previous build artifacts
if "%PACKAGE_ONLY%"=="false" (
    echo [INFO] Cleaning previous build artifacts...
    call pnpm run clean 2>nul || echo [WARN] Clean command failed, continuing...
)

REM Step 2: Install dependencies
if "%PACKAGE_ONLY%"=="false" (
    echo [INFO] Installing dependencies...
    where pnpm >nul 2>&1
    if !errorlevel! equ 0 (
        call pnpm install
    ) else (
        where npm >nul 2>&1
        if !errorlevel! equ 0 (
            call npm install
        ) else (
            echo [ERROR] Neither pnpm nor npm found. Please install a package manager.
            exit /b 1
        )
    )
)

REM Step 3: Build backend binaries
if "%SKIP_BINARIES%"=="false" (
    if "%PACKAGE_ONLY%"=="false" (
        echo [INFO] Building backend binaries...
        cd /d "%ROOT_DIR%"
        if exist "scripts\build_rovo_bridge.bat" (
            call scripts\build_rovo_bridge.bat
        ) else (
            echo [ERROR] Backend build script not found at scripts\build_rovo_bridge.bat
            exit /b 1
        )
        cd /d "%PLUGIN_DIR%"
    )
)

REM Step 4: Compile TypeScript
if "%PACKAGE_ONLY%"=="false" (
    echo [INFO] Compiling TypeScript...
    if "%BUILD_TYPE%"=="production" (
        call pnpm run compile:production
    ) else (
        call pnpm run compile
    )
)

REM Step 5: Run linting
if "%PACKAGE_ONLY%"=="false" (
    echo [INFO] Running linter...
    call pnpm run lint || echo [WARN] Linting failed, continuing with build...
)

REM Step 6: Run tests
if "%SKIP_TESTS%"=="false" (
    if "%PACKAGE_ONLY%"=="false" (
        echo [INFO] Running tests...
        call pnpm run test || echo [WARN] Tests failed, continuing with build...
    )
)

REM Step 7: Check for required binaries
echo [INFO] Checking for required binaries...
set "MISSING_BINARIES=false"

if not exist "resources\bin\windows\amd64\rovo-bridge.exe" (
    echo [WARN] Missing binary: resources\bin\windows\amd64\rovo-bridge.exe
    set "MISSING_BINARIES=true"
)
if not exist "resources\bin\macos\amd64\rovo-bridge" (
    echo [WARN] Missing binary: resources\bin\macos\amd64\rovo-bridge
    set "MISSING_BINARIES=true"
)
if not exist "resources\bin\macos\arm64\rovo-bridge" (
    echo [WARN] Missing binary: resources\bin\macos\arm64\rovo-bridge
    set "MISSING_BINARIES=true"
)
if not exist "resources\bin\linux\amd64\rovo-bridge" (
    echo [WARN] Missing binary: resources\bin\linux\amd64\rovo-bridge
    set "MISSING_BINARIES=true"
)
if not exist "resources\bin\linux\arm64\rovo-bridge" (
    echo [WARN] Missing binary: resources\bin\linux\arm64\rovo-bridge
    set "MISSING_BINARIES=true"
)

if "%MISSING_BINARIES%"=="true" (
    echo [WARN] Some binaries are missing. The extension may not work on all platforms.
    echo [WARN] Run 'scripts\build_rovo_bridge.bat' from the root directory to build all binaries.
)

REM Step 8: Create package
echo [INFO] Creating VSCode extension package...

REM Check if vsce is installed
where vsce >nul 2>&1
if !errorlevel! neq 0 (
    echo [INFO] Installing vsce ^(VSCode Extension Manager^)...
    call pnpm run install:vsce
)

REM Create the package
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "dt=%%a"
set "timestamp=%dt:~0,8%-%dt:~8,6%"

if "%BUILD_TYPE%"=="production" (
    call vsce package --out "rovobridge-%timestamp%.vsix"
) else (
    call vsce package --pre-release --out "rovobridge-dev-%timestamp%.vsix"
)

echo [INFO] Build completed successfully!
echo [INFO] Extension package created in: %PLUGIN_DIR%

REM List created .vsix files
echo [INFO] Available packages:
for %%f in (*.vsix) do echo   - %%f

echo.
echo [INFO] To install the extension:
for %%f in (*.vsix) do (
    echo   code --install-extension %%f
    goto :found_vsix
)
:found_vsix

echo.
echo [INFO] To publish the extension:
echo   vsce publish

endlocal