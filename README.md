# Chess Party Online

Two-player internet chess with a 3D tabletop board, public lobby browser, and private 4-digit join PINs.

## Local Development

1. Install dependencies with the bundled Node runtime or your own Node 22 runtime.
2. Run `npm run dev`.
3. Open `http://localhost:5173`.

The client uses Vite in development and connects to the WebSocket server on port `3000`.

## Hosted Build

Use:

```bash
npm run build:hosted
node dist/server/index.cjs
```

The server serves the built client and WebSocket endpoint from the same origin.

## Render

This repo includes [render.yaml](./render.yaml). The intended hosted flow is:

1. Push the repo to GitHub.
2. Create a Render Blueprint or web service from the repo.
3. Use this build command:

```bash
npm ci --include=dev && npm run build:hosted
```

4. Use this start command:

```bash
node dist/server/index.cjs
```

The `--include=dev` flag is required on Render because the build depends on dev tools like Vite and TypeScript even though the runtime itself is production-only.
5. Share the public site URL with friends.

Every room appears in the lobby browser, but joining still requires the host's 4-digit PIN.

## Legacy LAN Package

The desktop BAT flow still exists for local testing and packaging, but the main product path is now the hosted internet site.
