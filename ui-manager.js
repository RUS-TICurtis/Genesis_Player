/**
 * ui-manager.js
 * Handles all direct DOM manipulation, rendering, and UI-related event listeners.
 * It receives state from the main script and calls back to it to trigger business logic.
 */

let config = {
    playerContext: null,
    dom: {},
    callbacks: {},
};

let openContextMenu = null;
let currentLyricIndex = -1;

/**
 * Initializes the UI Manager with dependencies.
 * @param {object} dependencies - DOM elements, player context, and callback functions.
 */
export function init(dependencies) {
    config = { ...config, ...dependencies };
    attachUIEventListeners();
}

/**
 * Attaches event listeners that are purely for UI interactions.
 */
function attachUIEventListeners() {
    const { dom, callbacks } = config;

    // Library View Toggle
    if (dom.libraryGridViewBtn && dom.libraryListViewBtn && dom.libraryGrid) {
        dom.libraryGridViewBtn.addEventListener('click', () => switchLibraryView('grid'));
        dom.libraryListViewBtn.addEventListener('click', () => switchLibraryView('list'));
    }

    // Extended Info Panel
    if (dom.playbackBarTrackInfo && dom.extendedInfoPanel && dom.closeExtendedPanelBtn && dom.mainContent) {
        dom.playbackBarTrackInfo.addEventListener('click', () => {
            if (config.playerContext.currentTrackIndex > -1) {
                updateExtendedInfoPanel(config.playerContext.trackQueue[config.playerContext.currentTrackIndex]);
                dom.extendedInfoPanel.classList.add('active');
                dom.mainContent.classList.add('panel-active');
            }
        });

        dom.closeExtendedPanelBtn.addEventListener('click', () => {
            dom.extendedInfoPanel.classList.remove('active');
            dom.mainContent.classList.remove('panel-active');
        });
    }

    // Global click listener to close context menus
    document.addEventListener('click', (event) => {
        if (openContextMenu && !openContextMenu.contains(event.target) && !event.target.closest('.track-action-btn')) {
            closeContextMenu();
        }
    });
}

export function applyTheme(theme) {
    const themeToggle = config.dom.themeToggle;
    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
        if (themeToggle) themeToggle.checked = true;
    } else {
        document.body.classList.remove('dark-theme');
        if (themeToggle) themeToggle.checked = false;
    }
}

export function switchSection(targetId) {
    const { dom } = config;
    // Hide all sections
    dom.mainSections.forEach(section => section.classList.add('hidden'));
    if (dom.albumDetailView) dom.albumDetailView.classList.add('hidden');
    if (dom.artistDetailView) dom.artistDetailView.classList.add('hidden');

    // Show target section
    const target = document.getElementById(targetId);
    if (target) target.classList.remove('hidden');

    // Update active state in Sidebar & Bottom Nav
    [...dom.menuItems, ...dom.bottomNavItems].forEach(item => {
        item.classList.toggle('active', item.dataset.target === targetId);
    });
}

function switchLibraryView(view) {
    const { dom } = config;
    if (view === 'grid') {
        dom.libraryGrid.classList.remove('list-view');
        dom.libraryGridViewBtn.classList.add('active');
        dom.libraryListViewBtn.classList.remove('active');
    } else {
        dom.libraryGrid.classList.add('list-view');
        dom.libraryListViewBtn.classList.add('active');
        dom.libraryGridViewBtn.classList.remove('active');
    }
    localStorage.setItem('genesis_library_view', view);
}

export function showMessage(msg) {
    const { dom } = config;
    dom.msgText.innerHTML = msg;
    dom.msgModal.classList.remove('hidden');
}

export function showConfirmation(title, text) {
    const { dom } = config;
    return new Promise(resolve => {
        dom.confirmModalTitle.textContent = title;
        dom.confirmModalText.innerHTML = text;
        dom.confirmModal.classList.remove('hidden');

        dom.confirmOkBtn.onclick = () => {
            dom.confirmModal.classList.add('hidden');
            resolve(true);
        };
        dom.confirmCancelBtn.onclick = () => {
            dom.confirmModal.classList.add('hidden');
            resolve(false);
        };
    });
}

export function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function renderHomeGrid() {
    const { dom, playerContext, callbacks } = config;
    if (!dom.recentMediaGrid) return;

    const recentTracks = [...playerContext.libraryTracks].reverse().slice(0, 12);

    if (recentTracks.length === 0) {
        dom.recentMediaGrid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">Your recent media will appear here.</div>`;
        return;
    }

    dom.recentMediaGrid.innerHTML = recentTracks.map(track => `
        <div class="recent-media-card" data-track-id="${track.id}">
            <div class="album-art">
                <img src="${track.coverURL || './assets/default-art.png'}" alt="${track.name || 'Album Art'}">
            </div>
            <div class="card-footer">
                <h5>${track.name || 'Unknown Title'}</h5>
                <button class="control-btn small track-action-btn" title="More options"><i class="fas fa-ellipsis-v"></i></button>
            </div>
        </div>
    `).join('');

    dom.recentMediaGrid.querySelectorAll('.recent-media-card').forEach(card => {
        const trackId = card.dataset.trackId;
        card.addEventListener('click', (e) => {
            if (e.target.closest('.track-action-btn')) return;
            callbacks.playTrackFromId(trackId, 'recent');
        });
        card.querySelector('.track-action-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            renderTrackContextMenu(trackId, e.currentTarget, { isFromLibrary: true });
        });
    });
}

export function renderLibraryGrid() {
    const { dom, playerContext, callbacks } = config;
    if (!dom.libraryGrid) return;

    const sortedTracks = [...playerContext.libraryTracks].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    if (sortedTracks.length === 0) {
        dom.libraryGrid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">Your library is empty. Open some files to get started.</div>`;
        return;
    }

    dom.libraryGrid.innerHTML = sortedTracks.map(track => `
        <div class="recent-media-card" data-track-id="${track.id}">
            <div class="album-art">
                <img src="${track.coverURL || './assets/default-art.png'}" alt="${track.name || 'Album Art'}">
            </div>
            <div class="card-footer">
                <h5>${track.name || 'Unknown Title'}</h5>
                <button class="control-btn small track-action-btn" title="More options"><i class="fas fa-ellipsis-v"></i></button>
            </div>
        </div>
    `).join('');

    dom.libraryGrid.querySelectorAll('.recent-media-card').forEach(card => {
        const trackId = card.dataset.trackId;
        card.addEventListener('click', (e) => {
            if (e.target.closest('.track-action-btn')) return;
            callbacks.playTrackFromId(trackId, 'library');
        });
        card.querySelector('.track-action-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            renderTrackContextMenu(trackId, e.currentTarget, { isFromLibrary: true });
        });
    });
}

export function updatePlaybackBar(track) {
    const { dom } = config;
    if (!track) {
        dom.songTitle.textContent = "No Track Selected";
        dom.artistName.textContent = "Load files to begin";
        dom.albumArtImg.src = '';
        dom.albumArtImg.classList.add('hidden');
        dom.albumArtPlaceholder.classList.remove('hidden');
        return;
    }

    dom.songTitle.textContent = track.name || 'Unknown Title';
    dom.artistName.textContent = track.artist || (track.isURL ? 'Web Stream' : 'Unknown Artist');

    if (track.coverURL) {
        dom.albumArtImg.src = track.coverURL;
        dom.albumArtImg.classList.remove('hidden');
        dom.albumArtPlaceholder.classList.add('hidden');
    } else {
        dom.albumArtImg.src = '';
        dom.albumArtImg.classList.add('hidden');
        dom.albumArtPlaceholder.classList.remove('hidden');
    }

    if (dom.extendedInfoPanel.classList.contains('active')) {
        updateExtendedInfoPanel(track);
    }
}

export function updateExtendedInfoPanel(track) {
    const { dom } = config;
    if (!track) return;

    dom.extendedInfoArt.innerHTML = track.coverURL
        ? `<img src="${track.coverURL}" alt="Album Art">`
        : `<div class="placeholder-icon"><i class="fas fa-music"></i></div>`;
    dom.extendedInfoTitle.textContent = track.name || 'Unknown Title';
    dom.extendedInfoArtist.textContent = track.artist || 'Unknown Artist';

    currentLyricIndex = -1;

    if (track.syncedLyrics && track.syncedLyrics.length > 0) {
        dom.lyricsContainer.innerHTML = track.syncedLyrics.map((line, index) =>
            `<p class="lyric-line" data-index="${index}">${line.text || '&nbsp;'}</p>`
        ).join('');
    } else if (track.lyrics) {
        dom.lyricsContainer.innerHTML = track.lyrics.replace(/\n/g, '<br>');
    } else {
        dom.lyricsContainer.innerHTML = '<p class="lyric-line" style="font-style: italic;">No lyrics found for this track.</p>';
    }
}

export function updateProgressBarUI(currentTime, duration) {
    const { dom } = config;
    if (isNaN(duration) || duration <= 0) return;
    const pct = (currentTime / duration) * 100;
    dom.progressFill.style.width = `${pct}%`;
    dom.progressHead.style.left = `${pct}%`;
    dom.currentTimeEl.textContent = formatTime(currentTime);
    dom.durationEl.textContent = formatTime(duration);
}

export function updateLyrics(currentTime) {
    const { playerContext } = config;
    if (!playerContext.trackQueue || playerContext.currentTrackIndex < 0) return;

    const track = playerContext.trackQueue[playerContext.currentTrackIndex];
    if (!track || !track.syncedLyrics || track.syncedLyrics.length === 0) return;

    let newLyricIndex = -1;
    for (let i = track.syncedLyrics.length - 1; i >= 0; i--) {
        if (currentTime >= track.syncedLyrics[i].time) {
            newLyricIndex = i;
            break;
        }
    }

    if (newLyricIndex !== currentLyricIndex) {
        currentLyricIndex = newLyricIndex;
        const lyricLines = document.querySelectorAll('#lyrics-container .lyric-line');
        lyricLines.forEach((line, index) => {
            line.classList.remove('active', 'past', 'upcoming');
            if (index === currentLyricIndex) {
                line.classList.add('active');
                line.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else if (index < currentLyricIndex) {
                line.classList.add('past');
            } else {
                line.classList.add('upcoming');
            }
        });
    }
}

function closeContextMenu() {
    if (openContextMenu) {
        openContextMenu.remove();
        openContextMenu = null;
    }
}

function positionContextMenu(menu, button) {
    const rect = button.getBoundingClientRect();
    menu.style.position = 'absolute';
    menu.style.top = `${rect.bottom + window.scrollY}px`;
    menu.style.left = `${rect.right + window.scrollX - menu.offsetWidth}px`;

    if (rect.right + menu.offsetWidth > window.innerWidth) {
        menu.style.left = `${rect.left + window.scrollX - menu.offsetWidth}px`;
    }
}

export function renderTrackContextMenu(trackId, buttonElement, options = {}) {
    closeContextMenu();
    const { callbacks, playerContext } = config;

    const menu = document.createElement('div');
    menu.className = 'context-menu';

    const track = playerContext.libraryTracks.find(t => t.id === trackId);
    if (!track) return;

    const menuConfig = [
        { action: 'play', icon: 'fas fa-play', text: 'Play Song' },
        { action: 'play-next', icon: 'fas fa-step-forward', text: 'Play Next' },
        { action: 'add-to-queue', icon: 'fas fa-list-ol', text: 'Add to Play Queue', condition: options.isFromLibrary },
        { type: 'separator' },
        { action: 'edit-info', icon: 'fas fa-edit', text: 'Edit Info' },
        { type: 'separator' },
        { action: 'remove-from-playlist', icon: 'fas fa-minus-circle', text: 'Remove from this Playlist', condition: options.isFromPlaylist },
        { action: 'remove-from-queue', icon: 'fas fa-times', text: 'Remove from Queue', condition: options.isFromQueue },
        { action: 'remove-from-library', icon: 'fas fa-trash', text: 'Remove from Library', condition: options.isFromLibrary },
    ];

    // Add to Playlist Submenu
    const addToPlaylistItem = document.createElement('div');
    addToPlaylistItem.className = 'context-menu-item has-submenu';
    addToPlaylistItem.innerHTML = `<i class="fas fa-plus"></i> <span>Add to Playlist</span> <i class="fas fa-chevron-right submenu-arrow"></i>`;
    const submenu = document.createElement('div');
    submenu.className = 'context-menu-submenu';
    addToPlaylistItem.appendChild(submenu);

    const createNewPlaylistItem = document.createElement('div');
    createNewPlaylistItem.className = 'context-menu-item';
    createNewPlaylistItem.innerHTML = `<i class="fas fa-plus-circle"></i> <span>Create New Playlist</span>`;
    createNewPlaylistItem.addEventListener('click', () => {
        callbacks.createPlaylistFromTrack(trackId);
        closeContextMenu();
    });
    submenu.appendChild(createNewPlaylistItem);

    Object.values(callbacks.getPlaylists()).forEach(p => {
        const submenuItem = document.createElement('div');
        submenuItem.className = 'context-menu-item';
        submenuItem.innerHTML = `<i class="fas fa-list-ul"></i> <span>${p.name}</span>`;
        submenuItem.addEventListener('click', (e) => {
            e.stopPropagation();
            callbacks.addTrackToPlaylist(p.id, trackId);
            closeContextMenu();
        });
        submenu.appendChild(submenuItem);
    });

    menuConfig.forEach(item => {
        if (item.condition === false) return;

        if (item.type === 'separator') {
            menu.appendChild(document.createElement('hr'));
            return;
        }

        const itemEl = document.createElement('div');
        itemEl.className = 'context-menu-item';
        itemEl.innerHTML = `<i class="${item.icon}"></i> <span>${item.text}</span>`;
        itemEl.addEventListener('click', () => {
            callbacks.handleContextMenuAction(item.action, trackId, options);
            closeContextMenu();
        });
        menu.appendChild(itemEl);
    });

    // Insert "Add to Playlist" before the first separator
    const firstSeparator = menu.querySelector('hr');
    if (firstSeparator) {
        menu.insertBefore(addToPlaylistItem, firstSeparator);
    } else {
        menu.appendChild(addToPlaylistItem);
    }

    document.body.appendChild(menu);
    positionContextMenu(menu, buttonElement);

    setTimeout(() => {
        menu.classList.add('active');
        openContextMenu = menu;
    }, 10);
}

export function openEditModal(track) {
    const { dom } = config;
    dom.editTrackIdInput.value = track.id;
    dom.editTitleInput.value = track.name || '';
    dom.editArtistInput.value = track.artist || '';
    dom.editAlbumInput.value = track.album || '';
    dom.editLyricsInput.value = track.lyrics || '';
    dom.editModal.classList.remove('hidden');
}

export function updateSelectionBar() {
    const { dom, playerContext } = config;
    const count = playerContext.selectedTrackIds.size;
    if (count > 0) {
        dom.selectionCount.textContent = count;
        dom.selectionBar.classList.remove('hidden');
    } else {
        dom.selectionBar.classList.add('hidden');
    }
}

export function clearSelection() {
    config.playerContext.selectedTrackIds.clear();
    document.querySelectorAll('.track-select-checkbox:checked').forEach(cb => cb.checked = false);
    document.querySelectorAll('.track-list-row.selected').forEach(row => row.classList.remove('selected'));
    updateSelectionBar();
}