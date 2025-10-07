@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem Build rovo-bridge for multiple platforms and place binaries in both JetBrains and VSCode plugin resources.
rem JetBrains Targets:
rem - windows/amd64 -> hosts/jetbrains-plugin/src/main/resources/bin/windows/amd64/rovo-bridge.exe
rem - darwin/arm64  -> hosts/jetbrains-plugin/src/main/resources/bin/macos/arm64/rovo-bridge
rem - darwin/amd64  -> hosts/jetbrains-plugin/src/main/resources/bin/macos/amd64/rovo-bridge
rem - linux/amd64   -> hosts/jetbrains-plugin/src/main/resources/bin/linux/amd64/rovo-bridge
rem - linux/arm64   -> hosts/jetbrains-plugin/src/main/resources/bin/linux/arm64/rovo-bridge
rem VSCode Targets:
rem - windows/amd64 -> hosts/vscode-plugin/resources/bin/windows/amd64/rovo-bridge.exe
rem - darwin/arm64  -> hosts/vscode-plugin/resources/bin/macos/arm64/rovo-bridge
rem - darwin/amd64  -> hosts/vscode-plugin/resources/bin/macos/amd64/rovo-bridge
rem - linux/amd64   -> hosts/vscode-plugin/resources/bin/linux/amd64/rovo-bridge
rem - linux/arm64   -> hosts/vscode-plugin/resources/bin/linux/arm64/rovo-bridge

rem Resolve ROOT_DIR as the repo root (parent of scripts directory)
pushd "%~dp0\.."
set "ROOT_DIR=%CD%"
popd

set "BACKEND_DIR=%ROOT_DIR%\backend"
set "JETBRAINS_OUT_BASE=%ROOT_DIR%\hosts\jetbrains-plugin\src\main\resources\bin"
set "VSCODE_OUT_BASE=%ROOT_DIR%\hosts\vscode-plugin\resources\bin"
set "UI_DIR=%ROOT_DIR%\web-ui"

if not exist "%BACKEND_DIR%" (
  echo Error: backend directory not found at %BACKEND_DIR% 1>&2
  exit /b 1
)

rem Allow filtering targets via env var: ONLY="linux/amd64 darwin/arm64"
set "ONLY_TARGETS=%ONLY%"
set "UNMATCHED="
if defined ONLY_TARGETS (
  echo Building only specified targets: %ONLY_TARGETS%
  set "UNMATCHED= %ONLY_TARGETS% "
)

call :build_ui

rem Process each target
call :maybe_build windows/amd64 "%JETBRAINS_OUT_BASE%\windows\amd64\rovo-bridge.exe" "%VSCODE_OUT_BASE%\windows\amd64\rovo-bridge.exe"
call :maybe_build darwin/arm64 "%JETBRAINS_OUT_BASE%\macos\arm64\rovo-bridge" "%VSCODE_OUT_BASE%\macos\arm64\rovo-bridge"
call :maybe_build darwin/amd64 "%JETBRAINS_OUT_BASE%\macos\amd64\rovo-bridge" "%VSCODE_OUT_BASE%\macos\amd64\rovo-bridge"
call :maybe_build linux/amd64 "%JETBRAINS_OUT_BASE%\linux\amd64\rovo-bridge" "%VSCODE_OUT_BASE%\linux\amd64\rovo-bridge"
call :maybe_build linux/arm64 "%JETBRAINS_OUT_BASE%\linux\arm64\rovo-bridge" "%VSCODE_OUT_BASE%\linux\arm64\rovo-bridge"

rem Warn about unknown ONLY entries
if defined ONLY_TARGETS (
  for %%M in (!UNMATCHED!) do (
    if not "%%~M"=="" echo Skipping unknown target: %%M 1>&2
  )
)

echo.
echo All done. Binaries placed under:
echo   JetBrains: %JETBRAINS_OUT_BASE%
echo   VSCode: %VSCODE_OUT_BASE%
exit /b 0

:maybe_build
set "KEY=%~1"
set "JETBRAINS_OUT=%~2"
set "VSCODE_OUT=%~3"
if defined ONLY_TARGETS (
  set "PADDED= %ONLY_TARGETS% "
  echo !PADDED! | findstr /c:" !KEY! " >nul
  if errorlevel 1 goto :eof
  rem mark as matched
  set "UNMATCHED=!UNMATCHED: !KEY! = !"
)
for /f "tokens=1,2 delims=/" %%a in ("%KEY%") do (
  set "GOOS=%%a"
  set "GOARCH=%%b"
)
call :build_one "!GOOS!" "!GOARCH!" "!JETBRAINS_OUT!" "!VSCODE_OUT!"
goto :eof

:build_one
set "GOOS=%~1"
set "GOARCH=%~2"
set "JETBRAINS_OUT=%~3"
set "VSCODE_OUT=%~4"
echo => Building !GOOS!/!GOARCH! -> JetBrains: !JETBRAINS_OUT!, VSCode: !VSCODE_OUT!

rem Create directories for both outputs
for %%I in ("!JETBRAINS_OUT!") do set "JETBRAINS_DIR=%%~dpI"
for %%I in ("!VSCODE_OUT!") do set "VSCODE_DIR=%%~dpI"
if not exist "!JETBRAINS_DIR!" mkdir "!JETBRAINS_DIR!"
if not exist "!VSCODE_DIR!" mkdir "!VSCODE_DIR!"

rem Build to temporary location first
set "TEMP_BINARY=%TEMP%\rovo-bridge-!GOOS!-!GOARCH!"
if "!GOOS!"=="windows" set "TEMP_BINARY=!TEMP_BINARY!.exe"

pushd "%BACKEND_DIR%"
set "CGO_ENABLED=0"
set "GOOS=!GOOS!"
set "GOARCH=!GOARCH!"
go build -trimpath -ldflags="-s -w" -o "!TEMP_BINARY!" ./cmd/rovo-bridge
if errorlevel 1 (
  popd
  exit /b 1
)
popd

rem Copy to both plugin locations
copy "!TEMP_BINARY!" "!JETBRAINS_OUT!" >nul
copy "!TEMP_BINARY!" "!VSCODE_OUT!" >nul

rem Clean up temporary binary
del "!TEMP_BINARY!" >nul 2>nul

goto :eof

:build_ui
if "%SKIP_UI_BUILD%"=="1" (
  echo SKIP_UI_BUILD=1 -> skipping web UI build
  goto :eof
)
if not exist "%UI_DIR%" (
  echo Warning: UI dir not found at %UI_DIR%; skipping UI build 1>&2
  goto :eof
)
echo => Building web UI (Vite)
pushd "%UI_DIR%"

if exist pnpm-lock.yaml (
  echo Using pnpm (pnpm-lock.yaml found)
  set "PNPM_VERSION="
  for /f "usebackq delims=" %%v in (`node -p "try{(require('./package.json').packageManager||'').split('@')[1]||''}catch(e){''}" 2^>NUL`) do set "PNPM_VERSION=%%v"
  if not defined PNPM_VERSION set "PNPM_VERSION=9.0.0"

  where npx >nul 2>nul
  if not errorlevel 1 (
    set "PNPM_RUN=npx -y pnpm@!PNPM_VERSION!"
  ) else (
    where pnpm >nul 2>nul
    if not errorlevel 1 (
      set "PNPM_RUN=pnpm"
    ) else (
      goto :npm_fallback_no_pnpm
    )
  )

  call !PNPM_RUN! install --frozen-lockfile
  if errorlevel 1 goto :npm_fallback_from_pnpm
  call !PNPM_RUN! run build:debug
  if errorlevel 1 goto :npm_fallback_from_pnpm
  goto :build_ui_done
)

if exist package-lock.json (
  echo Using npm (package-lock.json found)
  call npm ci
  if errorlevel 1 call npm install
  call npm run build:debug
  goto :build_ui_done
)

if exist yarn.lock (
  echo Using yarn (yarn.lock found)
  call yarn install --frozen-lockfile
  if errorlevel 1 call yarn install
  call yarn run build:debug
  goto :build_ui_done
)

goto :npm_default

:npm_fallback_no_pnpm
echo pnpm/npx not found; falling back to npm 1>&2
call npm ci
if errorlevel 1 call npm install
call npm run build:debug
goto :build_ui_done

:npm_fallback_from_pnpm
echo pnpm install or build failed; falling back to npm 1>&2
call npm ci
if errorlevel 1 call npm install
call npm run build:debug
goto :build_ui_done

:npm_default
echo No lockfile found, defaulting to npm
call npm install
call npm run build:debug

:build_ui_done
popd
goto :eof
