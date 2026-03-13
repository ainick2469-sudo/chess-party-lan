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

Internet-hosted overhaul notes
- Converted the product flow from LAN-first to hosted internet multiplayer with a public lobby browser and private 4-digit join PINs.
- Added a public lobby list protocol (`lobby_list`), public `lobbyId`s, host-only PIN regeneration, reconnect-aware session reuse, and a `/health` endpoint for hosted deploys.
- Reworked the landing UI around `Create Lobby` + `Browse Lobbies`, including public room titles, join-from-list flow, and hosted copy instead of LAN instructions.
- Added reconnect/backoff on the client so refreshes auto-rejoin the same lobby or match via stored session token.
- Added `render.yaml` plus `npm run build:hosted` so the repo is ready for a Render web service deployment.
- Updated browser smoke coverage to exercise wrong PIN handling, public-list join, theme sync, reload/reconnect, and a full checkmate path.

Latest verification
- `npm run build:hosted`
- `npm test`
- `npm run test:smoke`

March 12 polish + solo mode notes
- Fixed the imported OBJ chess pieces by rotating and normalizing the `stevenalbert` asset pack as a Z-up model set before scaling. Pieces now render as real meshes instead of pedestals/discs only.
- Replaced the rigid auto camera with a smoother orbit rig: right mouse drag rotates, mouse wheel zooms, and scripted framing still eases into the current seat/focus square.
- Added a local solo mode on the landing screen with 10 bot ranks, selectable side, selectable variant, and theme carry-through into the live match.
- Added a shared bot search module with progressive difficulty settings, alpha-beta search, immediate win detection, and a bot sanity test for a forced mate-in-one.
- Updated `render_game_to_text` to expose solo session state and bot thinking status, and kept the hosted smoke test green after the landing layout changed.

Latest verification
- `npx tsc --noEmit`
- `npm test`
- `npm run build:hosted`
- `npm run test:smoke`
- Manual browser verification at `http://127.0.0.1:3021`:
  - confirmed imported pieces render
  - confirmed right-click orbit + wheel zoom changes the board view
  - confirmed solo move `e2e4` followed by a bot reply (`...e5`)

Known follow-ups
- Deploy the repo to Render and verify the public URL end-to-end with real remote clients.
- Consider server-side persistence or shared storage before scaling beyond one Render instance.
- Optional: add a clearer public-lobby status filter/sort UI if the lobby list gets busy.
- Optional: move the bot search off the main thread if higher ranks ever feel too heavy on low-end machines.
- Optional: make `window.debug_move` await the selected-square state transition internally so it can be used as a truly atomic test helper.

March 12 hosted landing fix notes
- Fixed the hosted landing page layout so `How This Works` no longer forces a third desktop row that clips the lobby footer and hides the solo-start controls on shorter viewports.
- Converted the desktop landing grid into a true 2x2 layout with per-card scrolling for tall content, which keeps `Browse Lobbies` and `Solo Mode` usable around 1600x900.
- Added smoke coverage that verifies `Start Solo Match` is visible and clickable at desktop height, then extended the hosted flow smoke timeout to 45s to account for the extra runtime without false failures.

Latest verification
- `npm test`
- `npm run build:hosted`
- `npm run test:smoke`
