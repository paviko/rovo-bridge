import {defineConfig} from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/**/*.test.js',
  version: '1.74.0',
  workspaceFolder: './test-fixtures',
  mocha: {
    ui: 'tdd',
    timeout: 20000
  },
  launchArgs: ['--disable-extensions', '--disable-workspace-trust']
});