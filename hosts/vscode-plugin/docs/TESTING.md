# VSCode Extension Testing Framework

This document describes the testing setup for the RovoBridge VSCode extension.

## Overview

The testing framework is set up using the official VSCode extension testing tools:
- **@vscode/test-cli** - Command-line test runner
- **@vscode/test-electron** - VSCode extension test environment
- **Mocha** - Test framework with TDD interface
- **ESLint** - Code linting and style checking

## Test Structure

```
src/
├── test/
│   ├── runTest.ts              # Test runner entry point
│   └── suite/
│       ├── index.ts            # Test suite configuration
│       ├── extension.test.ts   # Basic extension tests
│       └── communicationBridge.test.ts  # CommunicationBridge tests
└── [other source files]
```

## Available Scripts

### Run Tests
```bash
pnpm test
```
This runs the complete test suite including:
1. TypeScript compilation
2. ESLint linting
3. VSCode extension tests

### Compile Only
```bash
pnpm run compile
```
Compiles both main source and test files.

### Lint Only
```bash
pnpm run lint
```
Runs ESLint on the source files.

### Watch Mode
```bash
pnpm run watch
```
Watches for file changes and recompiles automatically.

## Test Configuration

### .vscode-test.mjs
Configures the VSCode test environment:
- VSCode version: 1.74.0
- Test files pattern: `out/test/**/*.test.js`
- Mocha UI: TDD (Test-Driven Development)
- Timeout: 20 seconds

### tsconfig.test.json
Separate TypeScript configuration for tests:
- Includes all source files (including tests)
- Outputs to `out/test/` directory
- Extends main tsconfig.json

## Writing Tests

### Test Structure (TDD Style)
```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('My Test Suite', () => {
    setup(() => {
        // Setup before each test
    });

    teardown(() => {
        // Cleanup after each test
    });

    test('should do something', () => {
        // Test implementation
        assert.strictEqual(actual, expected);
    });
});
```

### Available Assertions
- `assert.strictEqual(actual, expected)` - Strict equality
- `assert.ok(value)` - Truthy check
- `assert.doesNotThrow(fn)` - Function should not throw
- `assert.throws(fn)` - Function should throw

### VSCode API Testing
Tests have access to the full VSCode API:
```typescript
test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('rovobridge.rovobridge'));
});
```

## Mock Objects

### Mock Webview
For testing components that interact with webviews:
```typescript
const mockWebview = {
    postMessage: (message: any) => {
        messages.push(message);
        return Promise.resolve();
    },
    onDidReceiveMessage: (handler: any) => {
        return { dispose: () => {} };
    }
};
```

## Test Examples

### CommunicationBridge Tests
The `communicationBridge.test.ts` file demonstrates:
- Testing VSCode to WebUI communication
- Testing WebUI to VSCode message handling
- Testing error handling and edge cases
- Testing with mock webview objects

### Extension Tests
The `extension.test.ts` file demonstrates:
- Basic extension functionality tests
- VSCode API integration tests

## Debugging Tests

### VSCode Debug Configuration
Add to `.vscode/launch.json`:
```json
{
    "name": "Extension Tests",
    "type": "extensionHost",
    "request": "launch",
    "args": [
        "--extensionDevelopmentPath=${workspaceFolder}",
        "--extensionTestsPath=${workspaceFolder}/out/test/suite/index"
    ],
    "outFiles": [
        "${workspaceFolder}/out/test/**/*.js"
    ],
    "preLaunchTask": "${workspaceFolder}:npm: compile"
}
```

### Console Output
Test output and console.log statements appear in the VSCode test runner output.

## Continuous Integration

The test setup is designed to work in CI environments:
- Uses headless VSCode instance
- Configurable VSCode version
- Exit codes indicate test success/failure
- Detailed error reporting

## Dependencies

### Test Dependencies
- `@vscode/test-cli` - Test runner
- `@vscode/test-electron` - VSCode test environment
- `@types/mocha` - Mocha type definitions
- `mocha` - Test framework
- `glob` - File pattern matching

### Development Dependencies
- `@typescript-eslint/eslint-plugin` - TypeScript ESLint rules
- `@typescript-eslint/parser` - TypeScript parser for ESLint
- `eslint` - JavaScript/TypeScript linter

## Best Practices

1. **Test Isolation**: Each test should be independent
2. **Setup/Teardown**: Use setup() and teardown() for test preparation
3. **Mock External Dependencies**: Use mocks for webviews, file system, etc.
4. **Descriptive Test Names**: Use clear, descriptive test names
5. **Error Testing**: Test both success and error scenarios
6. **Async Testing**: Properly handle async operations with await
7. **Resource Cleanup**: Always dispose of resources in teardown

## Troubleshooting

### Common Issues

1. **"Cannot find name 'suite'"**
   - Make sure `@types/mocha` is installed
   - Check that tsconfig includes test files

2. **"Test run failed with code 1"**
   - Check test output for specific failures
   - Ensure all async operations are properly awaited

3. **VSCode version issues**
   - Update `.vscode-test.mjs` with compatible VSCode version
   - Check extension's `engines.vscode` in package.json

4. **Import/Module errors**
   - Verify TypeScript compilation is successful
   - Check that all dependencies are installed

### Debug Tips

1. Add `console.log()` statements in tests
2. Use VSCode debugger with test configuration
3. Check the test output for detailed error messages
4. Verify mock objects match expected interfaces