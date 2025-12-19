import db from './db.js';
import { playerContext } from './state.js';
import { extractMetadata } from './metadata-extractor.js';
import { showMessage, updateSelectionBar } from './ui-manager.js';
import { formatTime, parseLRC } from './utils.js';

// placeholders for dependencies to be injected or imported
let startPlaybackFn = null;
let renderTrackContextMenuFn = null;

export function setLibraryDependencies(startPlayback, renderTrackContextMenu) {
    startPlaybackFn = startPlayback;
    renderTrackContextMenuFn = renderTrackContextMenu;
}

export async function loadLibraryFromDB() {
    try {
        const storedTracks = await db.tracks.toArray();
        if (storedTracks) {
            const restorationPromises = storedTracks.map(async (track) => {
                let trackData = { ...track, objectURL: null };

                if (track.audioBlob) {
                    trackData.objectURL = URL.createObjectURL(track.audioBlob);
                    // Create a fresh objectURL for the cover art from its blob
                    if (track.coverBlob) {
                        trackData.coverURL = URL.createObjectURL(track.coverBlob);
                    }
                }

                // Parse lyrics if they exist
                if (trackData.lyrics) {
                    trackData.syncedLyrics = parseLRC(trackData.lyrics);
                }
                return trackData;
            });

            playerContext.libraryTracks = await Promise.all(restorationPromises);
            // Default play queue to component library is usually done in main script or here?
            // "playerContext.trackQueue = [...playerContext.libraryTracks];" 
            // We'll leave queue management to playback restoration logic or initial set up.

            renderHomeGrid();
            renderLibraryGrid();
        }
    } catch (e) {
        console.error("Error restoring library", e);
    }
}

export async function handleFiles(fileList, options = {}) {
    if (!fileList.length) return;

    const openMenuBtn = document.getElementById('open-menu-btn');
    const openMenuText = document.getElementById('open-menu-text');
    const originalText = openMenuText ? openMenuText.textContent : '';
    if (openMenuBtn) openMenuBtn.disabled = true;
    if (openMenuText && !options.isFromDiscover) openMenuText.textContent = 'Processing...';

    const newTracksForMemory = [];
    try {
        const isAudioFile = (file) => {
            if (file.type.startsWith('audio/')) {
                return true;
            }
            const audioExtensions = ['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.opus', '.weba'];
            const fileName = file.name.toLowerCase();
            return audioExtensions.some(ext => fileName.endsWith(ext));
        };

        const audioFiles = Array.from(fileList).filter(file => {
            const isValidAudio = isAudioFile(file);
            if (!isValidAudio) {
                console.warn(`Skipping non-audio file: ${file.name} (type: ${file.type})`);
                return false;
            }
            return true;
        });

        // Step 1: Extract Metadata (Outside Transaction)
        const detailedTracks = [];
        for (const file of audioFiles) {
            try {
                const metadata = await extractMetadata(file);
                if (metadata) {
                    // Fetch genre from API if missing or generic
                    if (!metadata.genre || metadata.genre === 'Unknown Genre') {
                        try {
                            const genreRes = await fetch(`/api/genre?title=${encodeURIComponent(metadata.title)}&artist=${encodeURIComponent(metadata.artist)}`);
                            if (genreRes.ok) {
                                const genreData = await genreRes.json();
                                if (genreData.genre && genreData.genre !== 'Unknown Genre') {
                                    metadata.genre = genreData.genre;
                                }
                            }
                        } catch (apiErr) {
                            console.warn("Failed to fetch genre from API", apiErr);
                        }
                    }

                    detailedTracks.push({
                        ...metadata,
                        audioBlob: file
                    });
                }
            } catch (err) {
                console.error(`Failed to extract metadata for: ${file.name}`, err);
            }
        }

        // Step 2: Database Storage (Inside Transaction)
        await db.transaction('rw', db.tracks, async () => {
            for (const trackForDB of detailedTracks) {
                try {
                    await db.tracks.put(trackForDB);

                    // Update Memory State (only if DB write succeeds)
                    const trackForMemory = { ...trackForDB, objectURL: URL.createObjectURL(trackForDB.audioBlob) };
                    if (trackForMemory.coverBlob) {
                        trackForMemory.coverURL = URL.createObjectURL(trackForMemory.coverBlob);
                    }
                    newTracksForMemory.push(trackForMemory);
                } catch (err) {
                    if (err.name === 'ConstraintError') {
                        console.warn(`Skipping duplicate track in DB: ${trackForDB.title}`);
                    } else {
                        console.error(`Failed to save track to DB: ${trackForDB.title}`, err);
                    }
                }
            }
        });

        if (newTracksForMemory.length > 0) {
            playerContext.libraryTracks.push(...newTracksForMemory);
            const totalFiles = audioFiles.length;
            const successCount = newTracksForMemory.length;
            const failCount = totalFiles - successCount;
            let message = `Added ${successCount} new track(s).`;
            if (failCount > 0) {
                message += ` ${failCount} file(s) failed to process.`;
            }
            showMessage(message);
            renderHomeGrid();
            renderLibraryGrid();
            if (window.refreshLibraryViews) window.refreshLibraryViews();
        } else {
            showMessage("No new valid audio files were added.");
        }
    } catch (error) {
        console.error("Error handling files:", error);
        showMessage("An unexpected error occurred while adding files.");
    } finally {
        if (openMenuBtn) openMenuBtn.disabled = false;
        if (openMenuText) openMenuText.textContent = originalText;
    }
}

export async function removeTrack(id) {
    await db.tracks.delete(id);
    const index = playerContext.libraryTracks.findIndex(t => t.id === id);
    if (index > -1) {
        playerContext.libraryTracks.splice(index, 1);
    }
    renderHomeGrid();
    renderLibraryGrid();
    if (window.refreshLibraryViews) window.refreshLibraryViews();
}

export async function handleRemoveTrack(trackId) {
    // Assumption: callers handle playback stop if needed, or we implement checking here later
    // For now, this is a direct database removal.
    await removeTrack(trackId);
}

export function renderHomeGrid() {
    const recentMediaGrid = document.getElementById('recent-media-grid');
    if (!recentMediaGrid) return;
    const recentTracks = [...playerContext.libraryTracks].reverse().slice(0, 12);

    if (recentTracks.length === 0) {
        recentMediaGrid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">Your recent media will appear here.</div>`;
        return;
    }

    recentMediaGrid.innerHTML = recentTracks.map(track => createCardHTML(track)).join('');
    attachGridListeners(recentMediaGrid);
}

export function renderLibraryGrid() {
    const libraryGrid = document.getElementById('library-grid');
    if (!libraryGrid) return;

    const isListView = libraryGrid.classList.contains('list-view');
    const sortedTracks = [...playerContext.libraryTracks].sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    if (sortedTracks.length === 0) {
        libraryGrid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">Your library is empty. Open some files to get started.</div>`;
        return;
    }

    if (isListView) {
        // Render List View (Rows)
        libraryGrid.innerHTML = `
            <div class="track-list-header">
                <span><input type="checkbox" id="select-all-library" title="Select All"></span>
                <span>#</span>
                <span>Title</span>
                <span>Artist</span>
                <span>Album</span>
                <span>Year</span>
                <span>Genre</span>
                <span>Duration</span>
            </div>
            <div id="library-list-rows"></div>
        `;

        const rowsContainer = document.getElementById('library-list-rows');
        renderDetailTrackList(sortedTracks.map(t => t.id), rowsContainer);

        // Handle select all
        setTimeout(() => {
            const selectAll = document.getElementById('select-all-library');
            if (selectAll) {
                selectAll.addEventListener('change', (e) => {
                    const checkboxes = rowsContainer.querySelectorAll('.track-select-checkbox');
                    checkboxes.forEach(cb => {
                        if (cb.checked !== e.target.checked) {
                            cb.checked = e.target.checked;
                            cb.dispatchEvent(new Event('change'));
                        }
                    });
                });
            }
        }, 0);
    } else {
        // Render Grid View (Cards)
        libraryGrid.innerHTML = sortedTracks.map(track => createCardHTML(track)).join('');
        attachGridListeners(libraryGrid);
    }
}

function createCardHTML(track) {
    return `
        <div class="recent-media-card" data-track-id="${track.id}" tabindex="0">
            <div class="album-art">
                ${track.coverURL ? `<img src="${track.coverURL}" alt="${track.title}">` : `<div class="placeholder-icon"><i class="fas fa-music"></i></div>`}
            </div>
            <div class="card-footer">
                <button class="control-btn small card-footer-play-btn" title="Play"><i class="fas fa-play"></i></button>
                <h5>${track.title || 'Unknown Title'}</h5>
                <button class="control-btn small track-action-btn" title="More options"><i class="fas fa-ellipsis-v"></i></button>
            </div>
        </div>
    `;
}

function attachGridListeners(container) {
    container.querySelectorAll('.recent-media-card').forEach(card => {
        const trackId = card.dataset.trackId;
        card.addEventListener('click', (e) => {
            if (e.target.closest('.track-action-btn') || e.target.closest('.card-footer-play-btn')) return;
            if (startPlaybackFn) startPlaybackFn([trackId]);
        });
        card.querySelector('.card-footer-play-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            if (startPlaybackFn) startPlaybackFn([trackId]);
        });
        card.querySelector('.track-action-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            if (renderTrackContextMenuFn) renderTrackContextMenuFn(trackId, e.currentTarget, { isFromLibrary: true });
        });
    });
}

export async function getTrackDetailsFromId(id) {
    let track = playerContext.libraryTracks.find(t => t.id === id);
    if (track) return track;
    track = await db.tracks.get(id);
    return track || { title: 'Unknown Track', duration: 0 };
}

export function saveTrackChanges(trackId, updatedMetadata) {
    const track = playerContext.libraryTracks.find(t => t.id === trackId);
    if (!track) return;
    Object.assign(track, updatedMetadata);
    db.tracks.put(track);
}

export function toggleTrackSelection(trackId) {
    if (playerContext.selectedTrackIds.has(trackId)) {
        playerContext.selectedTrackIds.delete(trackId);
    } else {
        playerContext.selectedTrackIds.add(trackId);
    }
    updateSelectionBar();
}

export function clearSelection() {
    playerContext.selectedTrackIds.clear();
    document.querySelectorAll('.track-select-checkbox:checked').forEach(cb => cb.checked = false);
    document.querySelectorAll('.track-list-row.selected').forEach(row => row.classList.remove('selected'));
    updateSelectionBar();
}

export async function renderDetailTrackList(trackIds, container, options = {}) {
    if (!container) return;
    if (trackIds.length === 0) {
        container.innerHTML = '<p style="padding: 20px;">No tracks found.</p>';
        return;
    }

    const trackRows = await Promise.all(trackIds.map(async (trackId, index) => {
        try {
            const trackData = await getTrackDetailsFromId(trackId);
            const row = document.createElement('div');
            row.className = 'track-list-row';
            row.dataset.id = trackId;

            row.innerHTML = `
                <input type="checkbox" class="track-select-checkbox" data-id="${trackId}">
                <button class="control-btn small row-play-btn" title="Play"><i class="fas fa-play"></i></button>
                <span class="track-title">${trackData.title || 'Unknown Title'}</span>
                <span class="track-artist">${trackData.artist || 'Unknown artist'}</span>
                <span class="track-album">${trackData.album || 'Unknown album'}</span>
                <span class="track-year">${trackData.year || ''}</span>
                <span class="track-genre">${trackData.genre || 'Unknown genre'}</span>
                <span class="track-duration">${formatTime(trackData.duration)}</span>
            `;

            row.addEventListener('click', e => {
                if (e.target.closest('.row-play-btn') || e.target.type === 'checkbox') return;
                if (startPlaybackFn) startPlaybackFn([trackId]);
            });
            row.querySelector('.row-play-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                if (startPlaybackFn) startPlaybackFn([trackId]);
            });
            row.querySelector('.track-select-checkbox').addEventListener('change', (e) => {
                toggleTrackSelection(trackId);
                e.currentTarget.closest('.track-list-row').classList.toggle('selected', e.currentTarget.checked);
            });

            return row;
        } catch (error) {
            console.error("Error fetching track for detail view:", error);
            return null;
        }
    }));

    container.innerHTML = '';
    trackRows.filter(Boolean).forEach(row => container.appendChild(row));
}
