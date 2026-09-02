# Project Notes

## Overview

- Electron desktop app for batch sharing Weibo links.
- Main process entry: `main.js`.
- Renderer entry: `renderer.js`.
- Share automation lives in `src/main/share-service.js`.

## Verified commands

- `npm start`
- `npm run build`
- `npm run build:win`
- `npm run build:mac`

## Key behavior

- Links can be loaded from a local `.txt` file or synced from the remote endpoint in `renderer.js`.
- Chrome path is auto-detected when possible, and can also be saved manually through the UI.
- Share progress is persisted through `electron-store`, including the current index and user settings.

## Current constraints

- The app relies on live Weibo page structure and login state, so selector changes on the site can break automation.
- The UI uses a preload bridge with `contextIsolation: true` and `nodeIntegration: false`.
