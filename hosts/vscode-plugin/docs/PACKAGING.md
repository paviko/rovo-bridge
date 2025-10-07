# VSCode Extension Packaging Guide

This document describes the packaging and distribution process for the RovoBridge VSCode extension.

## Overview

The RovoBridge VSCode extension is packaged as a `.vsix` file that includes:
- Compiled TypeScript code
- Cross-platform backend binaries
- Extension manifest and configuration
- Required resources and assets

## Prerequisites

### Development Environment
- Node.js 18.x or later
- pnpm (recommended) or npm
- VSCode 1.74.0 or later
- Go 1.22+ (for building backend binaries)

### Tools
- `@vscode/vsce` - VSCode Extension Manager
- `rimraf` - Cross-platform file removal
- TypeScript compiler

## Build Scripts

### Quick Commands

```bash
# Development build and package
./scripts/dev.sh setup     # Initial setup
./scripts/dev.sh build     # Build for development
./scripts/dev.sh package   # Create development package

# Production build
./scripts/build.sh --production

# Build with options
./scripts/build.sh --production --skip-tests
./scripts/build.sh --skip-binaries  # Use existing binaries
./scripts/build.sh --package-only   # Only create package
```

### Available Scripts (package.json)

```json
{
  "scripts": {
    "compile": "tsc -p ./ && tsc -p ./tsconfig.test.json",
    "compile:production": "tsc -p ./",
    "package": "pnpm run compile:production && vsce package",
    "package:pre-release": "pnpm run compile:production && vsce package --pre-release",
    "publish": "pnpm run compile:production && vsce publish",
    "publish:pre-release": "pnpm run compile:production && vsce publish --pre-release",
    "clean": "rimraf out *.vsix",
    "build:binaries": "cd ../../ && ./scripts/build_rovo_bridge.sh",
    "prebuild": "pnpm run build:binaries && pnpm run compile:production"
  }
}
```

## Packaging Process

### 1. Prepare Environment

```bash
cd hosts/vscode-plugin
pnpm install
```

### 2. Build Backend Binaries

The extension requires cross-platform binaries for the rovo-bridge backend:

```bash
# From project root
./scripts/build_rovo_bridge.sh

# Or from VSCode plugin directory
pnpm run build:binaries
```

This creates binaries in `resources/bin/`:
```
resources/bin/
├── windows/amd64/rovo-bridge.exe
├── macos/amd64/rovo-bridge
├── macos/arm64/rovo-bridge
├── linux/amd64/rovo-bridge
└── linux/arm64/rovo-bridge
```

### 3. Compile TypeScript

```bash
# Development build (includes test compilation)
pnpm run compile

# Production build (source only)
pnpm run compile:production
```

### 4. Create Package

```bash
# Development package (pre-release)
pnpm run package:pre-release

# Production package
pnpm run package
```

## Package Contents

### Included Files
- `out/` - Compiled JavaScript files
- `resources/bin/` - Cross-platform binaries
- `package.json` - Extension manifest
- `README.md` - Extension documentation
- `CHANGELOG.md` - Version history (if present)

### Excluded Files (.vscodeignore)
- Source TypeScript files (`src/`)
- Development configuration files
- Test files and fixtures
- Node modules
- Build artifacts (except `out/`)
- IDE-specific files

## Distribution

### Local Installation

```bash
# Install latest built package
code --install-extension rovobridge-*.vsix

# Or use the development script
./scripts/dev.sh install
```

### VSCode Marketplace

```bash
# Publish to marketplace (requires publisher account)
vsce publish

# Publish pre-release version
vsce publish --pre-release

# Publish specific version
vsce publish 1.0.0
```

### Manual Distribution

1. Create package: `pnpm run package`
2. Share the `.vsix` file
3. Recipients install with: `code --install-extension rovobridge-*.vsix`

## Version Management

### Semantic Versioning
- `1.0.0` - Major release
- `1.1.0` - Minor release (new features)
- `1.1.1` - Patch release (bug fixes)

### Pre-release Versions
- `1.0.0-alpha.1` - Alpha release
- `1.0.0-beta.1` - Beta release
- `1.0.0-rc.1` - Release candidate

### Updating Version

```bash
# Update version in package.json
npm version patch   # 1.0.0 -> 1.0.1
npm version minor   # 1.0.0 -> 1.1.0
npm version major   # 1.0.0 -> 2.0.0

# Or edit package.json manually
```

## CI/CD Integration

### GitHub Actions

The project includes a GitHub Actions workflow (`.github/workflows/build.yml`) that:
- Builds on multiple platforms (Ubuntu, Windows, macOS)
- Tests with multiple Node.js versions
- Creates packages for each platform
- Runs automated tests
- Uploads artifacts

### Automated Publishing

```yaml
# Example workflow step for publishing
- name: Publish to marketplace
  if: startsWith(github.ref, 'refs/tags/v')
  run: |
    cd hosts/vscode-plugin
    vsce publish --pat ${{ secrets.VSCE_PAT }}
  env:
    VSCE_PAT: ${{ secrets.VSCE_PAT }}
```

## Troubleshooting

### Common Issues

1. **Missing binaries**
   ```bash
   # Rebuild binaries
   ./scripts/build_rovo_bridge.sh
   ```

2. **TypeScript compilation errors**
   ```bash
   # Clean and rebuild
   pnpm run clean
   pnpm run compile
   ```

3. **Package size too large**
   - Check `.vscodeignore` file
   - Ensure `node_modules` is excluded
   - Remove unnecessary files from `resources/`

4. **Extension not loading**
   - Check VSCode version compatibility in `package.json`
   - Verify `main` entry point exists
   - Check extension activation events

### Debug Package Contents

```bash
# Extract and inspect package
unzip -l rovobridge-*.vsix

# Or use vsce
vsce ls
```

### Validate Package

```bash
# Check package before publishing
vsce package --dry-run

# Validate manifest
vsce verify rovobridge-*.vsix
```

## Security Considerations

### Binary Verification
- Binaries are built from source in CI/CD
- Cross-platform builds ensure consistency
- No external binary dependencies

### Package Integrity
- Use `vsce package` for consistent packaging
- Verify package contents before distribution
- Sign packages for enterprise distribution (if required)

### Token Security
- Store marketplace tokens securely
- Use environment variables in CI/CD
- Rotate tokens regularly

## Performance Optimization

### Package Size
- Exclude development files via `.vscodeignore`
- Compress binaries if possible
- Remove unused dependencies

### Startup Performance
- Minimize extension activation time
- Use lazy loading for heavy components
- Optimize binary extraction process

## Support and Maintenance

### Documentation
- Keep README.md updated
- Document breaking changes in CHANGELOG.md
- Provide migration guides for major versions

### Testing
- Test on all supported platforms
- Verify binary compatibility
- Test installation and uninstallation

### Monitoring
- Track extension usage metrics
- Monitor error reports
- Collect user feedback