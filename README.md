# 120 Degreez PWA

This folder contains an iPhone-friendly PWA version of the original Windows HTA app.

## What changed

- The original HTA used `ActiveXObject`, Windows Explorer, clipboard APIs, and a mapped `L:` drive.
- iPhone PWAs cannot use those Windows-only features.
- This PWA can sync from Google Sheets, import a CSV into browser storage, work offline, and be installed from Safari with **Share -> Add to Home Screen**.

## How to run

Serve the `pwa` folder from any static web server. Examples:

```powershell
cd "C:\Users\Borhan\Downloads\120 Degreez PWA - Web Application\pwa"
python -m http.server 8080
```

Then open `http://localhost:8080` on your computer, or your machine's LAN IP from Safari on iPhone.

## Google Sheets setup

The app is wired to this sheet:

- `https://docs.google.com/spreadsheets/d/1bK1rReW07p2nCorcAOsQM3FQappKEwy6mqnZBZdwhH0`

Expected columns in the first tab:

- `Project Number`
- `Project Name`
- `Project Path`

The sheet must allow viewer access for the PWA to read it.

## Current iPhone-safe behavior

- Sync from Google Sheets
- Import CSV from Files
- Search, sort, favorites, dark mode
- Add, edit, delete projects locally
- Export current data back to CSV
- Offline caching with a service worker

## Important limitation

Windows file system paths like `L:\Shared\...` cannot be opened on iPhone. If you need project files to open on iPhone, move them behind:

- a web URL
- a cloud storage link
- or an API/backend that the PWA can call
