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
let lastHeartbeatAt = 0;

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.use(express.static(staticDir));
app.use((_req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

wss.on('connection', (socket, request) => {
  rooms.registerSocket(socket, request.socket.remoteAddress ?? 'unknown');
  markSocketAlive(socket);

  socket.on('pong', () => {
    markSocketAlive(socket);
  });

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
  const now = Date.now();
  if (now - lastHeartbeatAt >= 15_000) {
    lastHeartbeatAt = now;
    for (const socket of wss.clients) {
      if (!isSocketAlive(socket)) {
        socket.terminate();
        continue;
      }
      markSocketDead(socket);
      socket.ping();
    }
  }
}, 250);

server.listen(port, host, async () => {
  const lanIp = detectLanIp();
  const localUrl = `http://localhost:${port}`;
  const lanUrl = lanIp ? `http://${lanIp}:${port}` : 'LAN IP unavailable';

  console.log('Chess Party server is live.');
  console.log(`Local URL: ${localUrl}`);
  if (lanIp) {
    console.log(`LAN URL: ${lanUrl}`);
  }
  console.log('Open this site in a browser, create a public lobby, then share the 4-digit join PIN privately.');

  if (process.env.NO_OPEN_BROWSER !== '1' && !process.env.RENDER) {
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

type HeartbeatSocket = WebSocket & { isAlive?: boolean };

function markSocketAlive(socket: WebSocket) {
  (socket as HeartbeatSocket).isAlive = true;
}

function markSocketDead(socket: WebSocket) {
  (socket as HeartbeatSocket).isAlive = false;
}

function isSocketAlive(socket: WebSocket) {
  return (socket as HeartbeatSocket).isAlive !== false;
}
