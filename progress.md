Original prompt: PLEASE IMPLEMENT THIS PLAN for a LAN casual chess party game: greenfield desktop-browser multiplayer chess launched by one Windows BAT file, with a 2.5D presentation, heavy pre-game customization, beginner-friendly onboarding, and variants including standard, Chess960, King of the Hill, Three-Check, and Atomic. The build should include a React + TypeScript + Vite client, a Node + ws authoritative LAN server, a shared rules adapter on top of chessops, a lobby with Mode/Clock/Help/Look settings, rematch and takeback flows, reconnect support, a Windows release folder with start-host.bat, and Playwright smoke coverage with render_game_to_text and advanceTime hooks.

TODO
- Optional: reduce the client bundle size with code splitting if startup time matters.
- Optional: add richer move animations and audio polish.
- Optional: expand smoke coverage for rematch/reconnect, takeback prompts, and non-standard variants.

Notes
- Workspace started empty.
- System PATH is minimal; Windows tools must be invoked by absolute path unless PATH is patched per command.
- Node/npm/python/git/powershell were not initially available on PATH.
- Provisioned a local Node 22.22.1 runtime under `.tools/node/node-v22.22.1-win-x64`.
- Implemented a React + TypeScript + Vite client with a 2.5D React Three Fiber board, DOM board overlay for deterministic input/testing, lobby/settings flow, prompts, rematches, and reconnect-aware session handling.
- Implemented a bundled Node + Express + ws server with authoritative room state, clocks, takebacks, rematches, reconnect handling, LAN URL logging, and static asset serving.
- Fixed release packaging so the desktop/server artifact is self-contained: the packaged server is now a bundled CommonJS entrypoint (`index.cjs`) and no longer depends on external npm packages like `express` at runtime.
- Implemented a shared chess rules adapter on top of `chessops` for standard, Chess960, King of the Hill, Three-Check, and Atomic.
- Added packaging via `scripts/package-release.mjs`, producing a sendable `release/` folder with `start-host.bat`, bundled server, built client, and local Node runtime.
- Replaced the old flat DOM chess overlay with mesh-based 3D board interaction and camera-driven seat orientation.
- Added imported MIT OBJ chess piece assets from `stevenalbert/3d-chess-opengl`, normalized at runtime and bundled into the client build.
- Rebuilt the UI shell into a compact desktop-style layout with theme-wide styling, stronger board readability, and fullscreen controls/prompting.
- Updated `render_game_to_text` and debug hooks to cover theme sync, seat identity, prompt state, and direct square interaction for automation.
- Verification completed:
  - `tsc --noEmit`
  - `npm test`
  - `npm run build`
  - `npm run test:smoke`
  - Packaged desktop release verification via `scripts/verify-desktop-release.ps1` succeeded and the desktop copy announced its LAN URL normally.
