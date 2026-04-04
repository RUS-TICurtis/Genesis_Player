# Build Guide: Developing and Packaging Genesis Player

This guide explains how to make changes to the Genesis Music Player and how to build it into an installable Windows application.

## 1. Development Environment
Before you begin, ensure you have:
- **Node.js 24.x** installed.
- The project dependencies installed via:
  ```bash
  npm install
  ```

## 2. Making Changes
You can modify the application by editing the following files:
- **UI/Styles**: `public/index.html` and CSS files inside `public/css/`.
- **Frontend Logic**: JavaScript modules inside the `js/` directory.
- **Desktop Features**: `electron.js` (main process) and `preload.js` (API bridge).
- **Backend API**: `backend/server.js` and its supporting modules.

## 3. Testing Your Changes
To see your changes in action without building the full installer:
1.  Open your terminal in the project root.
2.  Run the development command:
    ```bash
    npm run electron
    ```
This will start the local server and open the Electron desktop window. You can use the Chrome DevTools (`Ctrl+Shift+I` inside the app) to debug.

## 4. Building the Application
Once you are happy with your changes and want to create a shareable `.exe` file:

1.  **Stop** any running instances of the "Music Player".
2.  Run the build command:
    ```bash
    npm run dist
    ```
3.  Electron-builder will package your app. This process may take 1-2 minutes.

## 5. Output
After the build completes, look in the `dist/` folder:
- **`Music Player Setup 1.0.0.exe`**: The installer that adds the app to the Start Menu.
- **`Music Player 1.0.0.exe`**: A portable version that runs without installation.
- **`win-unpacked/`**: The raw files of the application (useful for testing the build quickly).

## 6. Important Notes
- **Icons**: Every build will include the latest icons from `public/assets`. The app shuffles these automatically on startup.
- **Permissions**: The build process uses system permissions to allow the app to scan your local folders for music.
- **Code Signing**: Currently, code signing is disabled in `package.json` to allow building without an expensive developer certificate.
