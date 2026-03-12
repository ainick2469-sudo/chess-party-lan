import express from 'express';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import path from 'node:path';

import { WebSocket, WebSocketServer } from 'ws';

import type { ClientMessage } from '../../shared/src';
import { ClientFacingError, RoomManager } from './room-manager';

const rootDir = process.cwd();
const staticDir = resolveStaticDir(rootDir);
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
const rooms = new RoomManager();

app.use(express.static(staticDir));
app.use((_req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

wss.on('connection', (socket) => {
  socket.on('message', (raw) => {
    try {
      const text = typeof raw === 'string' ? raw : raw.toString();
      const payload = JSON.parse(text) as ClientMessage;
      rooms.handleMessage(socket, payload);
    } catch (error) {
      const message =
        error instanceof ClientFacingError ? error.message : 'The server could not understand that request.';
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'error', message }));
      }
    }
  });

  socket.on('close', () => {
    rooms.handleDisconnect(socket);
  });
});

const interval = setInterval(() => {
  rooms.tick();
}, 250);

server.listen(port, host, async () => {
  const lanIp = detectLanIp();
  const localUrl = `http://localhost:${port}`;
  const lanUrl = lanIp ? `http://${lanIp}:${port}` : 'LAN IP unavailable';

  console.log('Chess Party LAN server is live.');
  console.log(`Local URL: ${localUrl}`);
  console.log(`LAN URL: ${lanUrl}`);
  console.log('Open the LAN URL on the other computer, then join with the 4-digit room code shown in the app.');

  if (process.env.NO_OPEN_BROWSER !== '1') {
    openBrowser(localUrl);
  }
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    clearInterval(interval);
    rooms.shutdown();
    wss.close();
    server.close(() => process.exit(0));
  });
}

function detectLanIp() {
  const networks = networkInterfaces();
  for (const entries of Object.values(networks)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family === 'IPv4' && !entry.internal) {
        return entry.address;
      }
    }
  }
  return undefined;
}

function openBrowser(url: string) {
  execFile('cmd.exe', ['/c', 'start', '', url], (error) => {
    if (error) {
      console.log('Could not open a browser automatically. Open the URL manually.');
    }
  });
}

function resolveStaticDir(rootDir: string) {
  if (process.env.STATIC_DIR) {
    return process.env.STATIC_DIR;
  }

  if (process.env.NODE_ENV !== 'production') {
    return path.resolve(rootDir, 'client/dist');
  }

  const packagedDir = path.resolve(rootDir, 'www');
  if (existsSync(path.join(packagedDir, 'index.html'))) {
    return packagedDir;
  }

  const clientDistDir = path.resolve(rootDir, 'client', 'dist');
  if (existsSync(path.join(clientDistDir, 'index.html'))) {
    return clientDistDir;
  }

  return path.resolve(rootDir, 'dist');
}
