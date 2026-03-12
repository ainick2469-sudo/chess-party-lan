import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const nodeExe = path.join(rootDir, '.tools', 'node', 'node-v22.22.1-win-x64', 'node.exe');
const serverEntry = path.join(rootDir, 'dist', 'server', 'index.cjs');

export default defineConfig({
  testDir: path.join(rootDir, 'tests'),
  testMatch: /smoke\.spec\.ts/,
  use: {
    baseURL: 'http://127.0.0.1:3010',
    headless: true
  },
  webServer: {
    command: `"${nodeExe}" "${serverEntry}"`,
    cwd: rootDir,
    url: 'http://127.0.0.1:3010',
    reuseExistingServer: true,
    env: {
      NO_OPEN_BROWSER: '1',
      PORT: '3010'
    }
  }
});
