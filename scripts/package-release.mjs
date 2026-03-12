import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const releaseDir = path.join(rootDir, 'release');
const clientDistDir = path.join(rootDir, 'client', 'dist');
const serverDistDir = path.join(rootDir, 'dist', 'server');
const nodeRuntimeDir = path.join(rootDir, '.tools', 'node', 'node-v22.22.1-win-x64');

await rm(releaseDir, { recursive: true, force: true });
await mkdir(releaseDir, { recursive: true });
await mkdir(path.join(releaseDir, 'server'), { recursive: true });

await cp(clientDistDir, path.join(releaseDir, 'www'), { recursive: true });
await cp(serverDistDir, path.join(releaseDir, 'server'), { recursive: true });
await cp(nodeRuntimeDir, path.join(releaseDir, 'node'), { recursive: true });

await writeFile(
  path.join(releaseDir, 'start-host.bat'),
  `@echo off
setlocal
cd /d "%~dp0"
set "NODE_ENV=production"
set "STATIC_DIR=%~dp0www"
set "PORT=3000"
set "AUTO_INCREMENT_PORT=1"
".\\node\\node.exe" ".\\server\\index.cjs"
pause
`,
  'utf8'
);
