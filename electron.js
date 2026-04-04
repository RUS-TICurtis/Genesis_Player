import { app, BrowserWindow, ipcMain, nativeImage, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import 'dotenv/config'; // Load env vars

// Import the server to start it
import './backend/server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let playbackState = {
    hasTrack: false,
    isPlaying: false,
    title: '',
    artist: '',
    isShuffled: false,
    repeatState: 0
};

const isWindows = process.platform === 'win32';

const createSvgIcon = (svgBody) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgBody}</svg>`;
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
    return nativeImage.createFromDataURL(dataUrl).resize({ width: 16, height: 16 });
};

const thumbarIcons = {
    previous: createSvgIcon('<polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5"></line>'),
    play: createSvgIcon('<polygon points="6 4 20 12 6 20 6 4"></polygon>'),
    pause: createSvgIcon('<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>'),
    next: createSvgIcon('<polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line>'),
    repeat: createSvgIcon('<polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path>'),
    shuffle: createSvgIcon('<polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line>')
};

const emitTaskbarControl = (action) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('taskbar-control', action);
};

const updateWindowsTaskbarControls = () => {
    if (!isWindows || !mainWindow || mainWindow.isDestroyed()) return;

    const hasTrack = Boolean(playbackState.hasTrack);
    const repeatLabel = playbackState.repeatState === 2 ? 'One' : (playbackState.repeatState === 1 ? 'All' : 'Off');

    const controls = [
        {
            tooltip: 'Previous',
            icon: thumbarIcons.previous,
            flags: hasTrack ? ['enabled'] : ['disabled'],
            click: () => emitTaskbarControl('previous')
        },
        {
            tooltip: playbackState.isPlaying ? 'Pause' : 'Play',
            icon: playbackState.isPlaying ? thumbarIcons.pause : thumbarIcons.play,
            flags: hasTrack ? ['enabled'] : ['disabled'],
            click: () => emitTaskbarControl('toggle-play')
        },
        {
            tooltip: 'Next',
            icon: thumbarIcons.next,
            flags: hasTrack ? ['enabled'] : ['disabled'],
            click: () => emitTaskbarControl('next')
        },
        {
            tooltip: `Repeat (${repeatLabel})`,
            icon: thumbarIcons.repeat,
            flags: hasTrack ? ['enabled'] : ['disabled'],
            click: () => emitTaskbarControl('toggle-repeat')
        },
        {
            tooltip: `Shuffle (${playbackState.isShuffled ? 'On' : 'Off'})`,
            icon: thumbarIcons.shuffle,
            flags: hasTrack ? ['enabled'] : ['disabled'],
            click: () => emitTaskbarControl('toggle-shuffle')
        }
    ];

    mainWindow.setThumbarButtons(controls);

    if (hasTrack) {
        const subtitle = [playbackState.title, playbackState.artist].filter(Boolean).join(' - ');
        mainWindow.setThumbnailToolTip(subtitle || 'Genesis Player');
    } else {
        mainWindow.setThumbnailToolTip('Genesis Player');
    }
};

const getIcons = () => {
    try {
        const assetsPath = path.join(__dirname, 'public/assets');
        const files = fs.readdirSync(assetsPath);
        return files
            .filter(file => file.startsWith('logo') && file.endsWith('.png'))
            .map(file => path.join(assetsPath, file));
    } catch (e) {
        console.error("Could not read assets", e);
        return [];
    }
};

const changeIcon = (win) => {
    const icons = getIcons();
    if (icons.length > 0) {
        const randomIcon = icons[Math.floor(Math.random() * icons.length)];
        try {
            const icon = nativeImage.createFromPath(randomIcon);
            win.setIcon(icon);
        } catch (err) {
            console.error("Failed to set icon:", err);
        }
    }
};

// Recursive file scan
const scanDirectory = (dir, fileList = []) => {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        try {
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
                scanDirectory(filePath, fileList);
            } else {
                const ext = path.extname(file).toLowerCase();
                const audioExtensions = ['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.opus', '.weba'];
                if (audioExtensions.includes(ext)) {
                    fileList.push({
                        path: filePath,
                        name: file
                    });
                }
            }
        } catch (e) {
            // Ignore access errors
        }
    });
    return fileList;
};

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        title: "Music Player",
        icon: path.join(__dirname, 'public/assets/logo.png'),
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        },
        show: false
    });

    changeIcon(mainWindow);
    updateWindowsTaskbarControls();

    const PORT = process.env.PORT || 1552;
    const serverUrl = `http://localhost:${PORT}`;

    const loadWindow = () => {
        mainWindow.loadURL(serverUrl).then(() => {
            mainWindow.show();
        }).catch(err => {
            console.log(`Server not ready yet: ${err.message}, retrying...`);
            setTimeout(loadWindow, 1000);
        });
    };

    loadWindow();

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    createWindow();

    ipcMain.on('change-app-icon', () => {
        if (mainWindow) changeIcon(mainWindow);
    });

    ipcMain.on('playback-state', (_event, state) => {
        playbackState = {
            ...playbackState,
            ...(state || {})
        };
        updateWindowsTaskbarControls();
    });

    ipcMain.handle('select-folder', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory']
        });
        if (result.canceled || result.filePaths.length === 0) {
            return [];
        }
        const dirPath = result.filePaths[0];
        try {
            // Verify path exists
            if (fs.existsSync(dirPath)) {
                // Scan
                const files = scanDirectory(dirPath);
                return files; // Returns array of { path, name }
            }
        } catch (e) {
            console.error("Error scanning dir", e);
        }
        return [];
    });

    ipcMain.handle('read-file', async (event, filePath) => {
        try {
            const buffer = fs.readFileSync(filePath);
            return buffer; // Electron handles buffer serialization
        } catch (e) {
            console.error("Error reading file", filePath, e);
            return null;
        }
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
