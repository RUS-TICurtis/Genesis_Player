# Genesis Music Player Documentation

## Project Overview
Genesis is a modern music player application built with Web Technologies (HTML, CSS, JavaScript) and packaged for desktop using Electron. It features a robust library management system using IndexedDB, dynamic icon shuffling, and a sleek, responsive UI.

## Folder Structure

```
Music-Player-Exe/
├── backend/                # Server-side logic (Express.js)
│   └── server.js           # Main server entry point
├── dist/                   # Build artifacts (installers, executables)
├── js/                     # Frontend JavaScript modules
│   ├── album-manager.js    # Logic for Album view
│   ├── artist-manager.js   # Logic for Artist view
│   ├── db.js               # Dexie.js database configuration
│   ├── library-manager.js  # Core library logic (files, scanning)
│   ├── playback-manager.js # Audio playback control
│   ├── script.js           # Main frontend entry point (event listeners)
│   ├── ui-manager.js       # UI manipulation helper functions
│   └── ...                 # Other specific managers (queue, playlist, etc.)
├── public/                 # Static assets
│   ├── assets/             # Images, icons, and fonts
│   ├── css/                # (Optional) Stylesheets
│   ├── index.html          # Main application HTML file (served by backend)
│   └── style.css           # Main CSS file
├── electron.js             # Electron main process (entry point)
├── preload.js              # Electron preload script (security bridge)
├── package.json            # Project metadata and scripts
├── vercel.json             # Vercel deployment configuration
└── .env                    # Environment variables (PORT, etc.)
```

## Running the Application Locally

1.  **Install Dependencies**:
    ```bash
    npm install
    ```
    *Ensure you have Node.js version 24.x installed as per project requirements.*

2.  **Dev Mode (Electron)**:
    ```bash
    npm run electron
    ```
    This starts the local Express server and launches the Electron window.

3.  **App Shuffling Feature**:
    - The application icon shuffles randomly on every restart and when switching themes (Light/Dark mode).
    - Icons are sourced from `public/assets/logo-*.png`.

## Deployment

### Desktop Packaging (Windows)
To build the `.exe` installer and portable executable:

```bash
npm run dist
```
The output files will be located in the `dist/` directory.

### Web Hosting (Vercel/Render)
The application handles both Desktop (Electron) and Web env contexts.
- **Vercel**: The `vercel.json` dictates the build configuration.
- **Render**: Connect the repo and use `node backend/server.js` or `npm start` as the start command.

## Key Features & APIs
- **Native File Access**: Uses Electron's native dialogs for selecting folders, allowing rapid recursive scanning of music libraries.
- **IndexedDB**: Metadata is cached locally using Dexie.js for instant library loading.
- **Metadata Extraction**: Uses `music-metadata-browser` to parse ID3 tags from audio files locally.

## Compliance & Best Practices
- **Security**: `nodeIntegration` is disabled. Context Isolation is enabled. All native access is proxied securely via `preload.js`.
- **Performance**: Large I/O operations (like file scanning) happen via Node.js native standard libraries in the main process, keeping the UI responsive.
