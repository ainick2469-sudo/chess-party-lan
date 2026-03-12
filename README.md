# Chess Party LAN

Two-player LAN chess with a 3D tabletop board, theme customization, and variants.

## Fast Start

If you downloaded this repo as a ZIP from GitHub:

1. Extract the ZIP.
2. Open the extracted folder.
3. Double-click [`start-host.bat`](./start-host.bat).
4. Keep the console window open.
5. Send the `LAN URL` shown in the console to the other player.
6. The guest opens that URL in a browser and joins with the 4-digit room code shown in the app.

## Notes

- Only the host needs to run `start-host.bat`.
- Both players need to be on the same Wi-Fi / LAN.
- If the browser does not open automatically, copy the printed `Local URL` into the host browser manually.
- The built client lives in [`client/dist`](./client/dist) and the bundled server lives in [`dist/server`](./dist/server).
