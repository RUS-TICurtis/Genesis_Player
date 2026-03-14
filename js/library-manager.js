import db from './db.js';
import { playerContext } from './state.js';
import { extractMetadata } from './metadata-extractor.js';
import { showMessage, updateSelectionBar } from './ui-manager.js';
import { formatTime, parseLRC, truncate, getFallbackImage } from './utils.js';

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

                // Lazy load audio URLs, but eager load cover art for UI
                if (track.coverBlob) {
                    trackData.coverURL = URL.createObjectURL(track.coverBlob);
                }

                // Parse lyrics if they exist
                if (trackData.lyrics) {
                    trackData.syncedLyrics = parseLRC(trackData.lyrics);
                }
                return trackData;
            });

            playerContext.libraryTracks = await Promise.all(restorationPromises);
            playerContext.libraryTracksMap = new Map(playerContext.libraryTracks.map(t => [t.id, t]));

            updateLibraryCaches();

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

        // Step 1: Extract Metadata in Parallel (Outside Transaction)
        const concurrencyLimit = 5;
        const detailedTracks = [];

        const processFile = async (file) => {
            try {
                const metadata = await extractMetadata(file);
                if (metadata) {
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
                    return { ...metadata, audioBlob: file };
                }
            } catch (err) {
                console.error(`Failed to extract metadata for: ${file.name}`, err);
            }
            return null;
        };

        for (let i = 0; i < audioFiles.length; i += concurrencyLimit) {
            const batch = audioFiles.slice(i, i + concurrencyLimit);
            const results = await Promise.all(batch.map(processFile));
            detailedTracks.push(...results.filter(Boolean));
        }

        // Step 2: Database Storage (Bulk Put)
        if (detailedTracks.length > 0) {
            try {
                await db.tracks.bulkPut(detailedTracks);

                detailedTracks.forEach(trackForDB => {
                    // Update Memory State (Lazy load audio objectURL)
                    const trackForMemory = { ...trackForDB, objectURL: null };
                    if (trackForMemory.coverBlob) {
                        trackForMemory.coverURL = URL.createObjectURL(trackForMemory.coverBlob);
                    }
                    newTracksForMemory.push(trackForMemory);
                });
            } catch (err) {
                console.error("Bulk database write failed, falling back to individual puts", err);
                // Fallback to individual puts if bulk fails (e.g. one track is too large for a single transaction)
                for (const trackForDB of detailedTracks) {
                    try {
                        await db.tracks.put(trackForDB);
                        const trackForMemory = { ...trackForDB, objectURL: null };
                        if (trackForMemory.coverBlob) {
                            trackForMemory.coverURL = URL.createObjectURL(trackForMemory.coverBlob);
                        }
                        newTracksForMemory.push(trackForMemory);
                    } catch (individualErr) {
                        console.error(`Failed to save track individually: ${trackForDB.title}`, individualErr);
                    }
                }
            }
        }

        if (newTracksForMemory.length > 0) {
            playerContext.libraryTracks.push(...newTracksForMemory);
            newTracksForMemory.forEach(t => playerContext.libraryTracksMap.set(t.id, t));

            updateLibraryCaches();

            const totalFiles = audioFiles.length;
            const successCount = newTracksForMemory.length;
            const failCount = totalFiles - successCount;
            let message = `Added ${successCount} new track(s).`;
            if (failCount > 0) {
                message += ` ${failCount} file(s) failed to process.`;
            }
            // showMessage(message);
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
    const track = playerContext.libraryTracksMap.get(id);
    if (track) {
        if (track.objectURL) URL.revokeObjectURL(track.objectURL);
        if (track.coverURL && !track.coverURL.startsWith('assets/')) {
            URL.revokeObjectURL(track.coverURL);
        }
    }

    await db.tracks.delete(id);
    const index = playerContext.libraryTracks.findIndex(t => t.id === id);
    if (index > -1) {
        playerContext.libraryTracks.splice(index, 1);
    }
    playerContext.libraryTracksMap.delete(id);

    updateLibraryCaches();

    renderHomeGrid();
    renderLibraryGrid();
    if (window.refreshLibraryViews) window.refreshLibraryViews();
}

export async function handleRemoveTrack(trackId) {
    // Assumption: callers handle playback stop if needed, or we implement checking here later
    // For now, this is a direct database removal.
    await removeTrack(trackId);
}

export function updateLibraryCaches() {
    const tracks = playerContext.libraryTracks;
    const artistsMap = new Map();
    const albumsMap = new Map();

    tracks.forEach(t => {
        // Pre-compute search string
        if (!t.searchStr) {
            t.searchStr = `${t.title || ''} ${t.artist || ''} ${t.album || ''}`.toLowerCase();
        }

        // Artist Cache
        const artistName = t.artist || 'Unknown Artist';
        if (!artistsMap.has(artistName)) {
            artistsMap.set(artistName, {
                name: artistName,
                coverURL: null,
                trackIds: []
            });
        }
        const artistData = artistsMap.get(artistName);
        artistData.trackIds.push(t.id);
        if (t.coverURL && !artistData.coverURL) {
            artistData.coverURL = t.coverURL;
        }

        // Album Cache
        if (t.album) {
            const albumKey = `${t.album}|${artistName}`;
            if (!albumsMap.has(albumKey)) {
                albumsMap.set(albumKey, {
                    name: t.album,
                    artist: artistName,
                    coverURL: t.coverURL,
                    trackIds: []
                });
            }
            const albumData = albumsMap.get(albumKey);
            albumData.trackIds.push(t.id);
            if (t.coverURL && !albumData.coverURL) {
                albumData.coverURL = t.coverURL;
            }
        }
    });

    playerContext.cachedArtists = [...artistsMap.values()].sort((a, b) => a.name.localeCompare(b.name));
    playerContext.cachedAlbums = [...albumsMap.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function renderHomeGrid() {
    renderSuggestions();
    renderTopArtists();
    renderTopAlbums();
    renderRecentArtists();
    renderRecentAlbums();
    renderFavorites();
}

function renderSuggestions() {
    const container = document.getElementById('home-suggestions-container');
    if (!container) return;
    // Dynamic Suggestions based on Discovery
    const suggestions = [
        { type: 'trending', title: 'Trending Now', icon: 'fa-fire', color: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)' },
        { type: 'pop', title: 'Pop Hits', icon: 'fa-music', color: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)' },
        { type: 'rock', title: 'Rock Classics', icon: 'fa-guitar', color: 'linear-gradient(135deg, #29323c 0%, #485563 100%)' },
        { type: 'new', title: 'New Arrivals', icon: 'fa-clock', color: 'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)' }
    ];

    container.innerHTML = suggestions.map(s => `
        <div class="suggestion-card" data-mix-type="${s.type}">
            <div class="suggestion-card-bg" style="background: ${s.color}; height: 100%; display: flex; align-items: center; justify-content: center;">
                <i class="fas ${s.icon}" style="font-size: 40px; color: rgba(255,255,255,0.8);"></i>
            </div>
            <div class="suggestion-card-overlay">
                <span class="suggestion-card-title">${s.title}</span>
            </div>
        </div>
    `).join('');
}

function renderTopArtists() {
    const container = document.getElementById('home-top-artists-container');
    if (!container) return;

    // Use cached artists
    const artists = playerContext.cachedArtists.slice(0, 6);

    if (artists.length === 0) {
        container.innerHTML = '<div style="padding:10px; color:var(--text-color);">No artists found</div>';
        return;
    }

    container.innerHTML = artists.map(artist => {
        const imgUrl = artist.coverURL || getFallbackImage(artist.name);
        return `
            <div class="artist-circle-card" data-artist="${artist.name}">
                <div class="artist-img-container">
                    <img src="${imgUrl}" alt="${artist.name}" loading="lazy">
                </div>
                <span class="artist-name">${truncate(artist.name, 20)}</span>
            </div>
        `;
    }).join('');

    // Attach listeners
    container.querySelectorAll('.artist-circle-card').forEach(card => {
        card.addEventListener('click', () => {
            import('./artist-manager.js').then(m => m.openArtistByName(card.dataset.artist));
        });
    });
}

function renderTopAlbums() {
    const container = document.getElementById('home-top-albums-container');
    if (!container) return;

    // Use cached albums
    const albums = playerContext.cachedAlbums.slice(0, 6);

    if (albums.length === 0) {
        container.innerHTML = '<div style="padding:10px; color:var(--text-color);">No albums found</div>';
        return;
    }

    container.innerHTML = albums.map(album => {
        return `
            <div class="album-square-card" data-album="${album.name}" data-artist="${album.artist}">
                <div class="album-img-wrapper">
                    <img src="${album.coverURL || getFallbackImage(album.name)}" alt="${album.name}" loading="lazy">
                </div>
                <span class="card-title-text">${truncate(album.name, 20)}</span>
                <span class="card-subtitle-text">${truncate(album.artist, 20)}</span>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.album-square-card').forEach(card => {
        card.addEventListener('click', () => {
            import('./album-manager.js').then(m => m.openAlbum(card.dataset.album, card.dataset.artist));
        });
    });
}

function renderRecentArtists() {
    const container = document.getElementById('home-recent-artists-container');
    if (!container) return;

    // Just grab distinct artists from recent tracks (reverse order of libraryTracks)
    const recentTracks = [...playerContext.libraryTracks].reverse();
    const seen = new Set();
    const recentArtists = [];

    for (const t of recentTracks) {
        const artistName = t.artist || 'Unknown Artist';
        if (!seen.has(artistName)) {
            seen.add(artistName);
            const artistData = playerContext.cachedArtists.find(a => a.name === artistName);
            if (artistData) recentArtists.push(artistData);
            if (recentArtists.length === 10) break;
        }
    }

    if (recentArtists.length === 0) {
        container.innerHTML = '<div style="padding:10px; color:var(--text-color);">No recent artists</div>';
        return;
    }

    container.innerHTML = recentArtists.map(artist => {
        const imgUrl = artist.coverURL || getFallbackImage(artist.name);
        return `
            <div class="artist-circle-card" data-artist="${artist.name}">
                <div class="artist-img-container">
                    <img src="${imgUrl}" alt="${artist.name}" loading="lazy">
                </div>
                <span class="artist-name">${truncate(artist.name, 20)}</span>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.artist-circle-card').forEach(card => {
        card.addEventListener('click', () => {
            import('./artist-manager.js').then(m => m.openArtistByName(card.dataset.artist));
        });
    });
}

function renderRecentAlbums() {
    const container = document.getElementById('home-recent-albums-container');
    if (!container) return;

    // Get unique albums in reverse order of addition
    const recentTracks = [...playerContext.libraryTracks].reverse();
    const seen = new Set();
    const recentAlbums = [];

    for (const t of recentTracks) {
        if (t.album) {
            const albumKey = `${t.album}|${t.artist || 'Unknown Artist'}`;
            if (!seen.has(albumKey)) {
                seen.add(albumKey);
                const albumData = playerContext.cachedAlbums.find(a => a.name === t.album && a.artist === (t.artist || 'Unknown Artist'));
                if (albumData) recentAlbums.push(albumData);
                if (recentAlbums.length === 10) break;
            }
        }
    }

    if (recentAlbums.length === 0) {
        container.innerHTML = '<div style="padding:10px; color:var(--text-color);">No recent albums</div>';
        return;
    }

    container.innerHTML = recentAlbums.map(album => {
        return `
            <div class="album-square-card" data-album="${album.name}" data-artist="${album.artist}">
                <div class="album-img-wrapper">
                    <img src="${album.coverURL || getFallbackImage(album.name)}" alt="${album.name}" loading="lazy">
                </div>
                <span class="card-title-text">${truncate(album.name, 20)}</span>
                <span class="card-subtitle-text">${truncate(album.artist, 20)}</span>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.album-square-card').forEach(card => {
        card.addEventListener('click', () => {
            import('./album-manager.js').then(m => m.openAlbum(card.dataset.album, card.dataset.artist));
        });
    });
}

function renderFavorites() {
    const container = document.getElementById('home-favorites-container');
    if (!container) return;

    // For now, look for a playlist named 'Favorites' in localStorage since we don't have direct access here easily
    // or just use Most Played if we had counters. 
    // Let's use any tracks that might have been marked as favorites (if we had the UI).
    // As a fallback, we'll show the tracks from a playlist named 'Favorites' if it exists.

    let favoriteTracks = [];
    try {
        const storedPlaylists = JSON.parse(localStorage.getItem('genesis_playlists') || '{}');
        const favoritesPlaylist = Object.values(storedPlaylists).find(p => p.name.toLowerCase() === 'favorites');
        if (favoritesPlaylist && favoritesPlaylist.trackIds.length > 0) {
            favoriteTracks = favoritesPlaylist.trackIds.map(id => playerContext.libraryTracksMap.get(id)).filter(Boolean);
        }
    } catch (e) {
        console.error("Error loading favorites for home screen", e);
    }

    if (favoriteTracks.length === 0) {
        container.innerHTML = '<div style="padding:10px; color:var(--text-color);">No favorites yet. Add some tracks to a "Favorites" playlist!</div>';
        return;
    }

    container.innerHTML = favoriteTracks.slice(0, 10).map(track => {
        return `
            <div class="album-square-card" data-track-id="${track.id}">
                <div class="album-img-wrapper">
                    <img src="${track.coverURL || getFallbackImage(track.id, track.title)}" alt="${track.title}" loading="lazy">
                </div>
                <span class="card-title-text">${truncate(track.title, 40)}</span>
                <span class="card-subtitle-text">${truncate(track.artist || 'Unknown', 20)}</span>
            </div>
        `;
    }).join('');

    // Attach simple click to play for these square cards
    container.querySelectorAll('.album-square-card').forEach(card => {
        card.addEventListener('click', () => {
            if (startPlaybackFn) startPlaybackFn([card.dataset.trackId]);
        });
    });
}

export function renderFavoritesGrid() {
    const container = document.getElementById('favorites-grid');
    if (!container) return;

    let favoriteTracks = [];
    try {
        const storedPlaylists = JSON.parse(localStorage.getItem('genesis_playlists') || '{}');
        const favoritesPlaylist = Object.values(storedPlaylists).find(p => p.name.toLowerCase() === 'favorites');
        if (favoritesPlaylist && favoritesPlaylist.trackIds.length > 0) {
            favoriteTracks = favoritesPlaylist.trackIds.map(id => playerContext.libraryTracksMap.get(id)).filter(Boolean);
        }
    } catch (e) {
        console.error("Error loading favorites grid", e);
    }

    if (favoriteTracks.length === 0) {
        container.innerHTML = '<div class="empty-state">No favorites yet. Add some tracks to a "Favorites" playlist!</div>';
        return;
    }

    container.innerHTML = favoriteTracks.map(track => createCardHTML(track)).join('');
    attachGridListeners(container);
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
                <span class="status-icon-header"><input type="checkbox" id="select-all-library" title="Select All"></span>
                <span class="status-icon-header">#</span>
                <span>Title</span>
                <span>Artist</span>
                <span>Album</span>
                <span>Year</span>
                <span>Genre</span>
                <span style="text-align: right;">Duration</span>
            </div>
            <div id="library-list-rows"></div>
        `;

        const rowsContainer = document.getElementById('library-list-rows');
        renderDetailTrackList(sortedTracks.map(t => t.id), rowsContainer);

        // Handle select all
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
    } else {
        // Render Grid View (Cards)
        const fragment = document.createDocumentFragment();
        sortedTracks.forEach(track => {
            const card = document.createElement('div');
            card.innerHTML = createCardHTML(track);
            const cardElement = card.firstElementChild;
            attachCardListeners(cardElement, track.id);
            fragment.appendChild(cardElement);
        });
        libraryGrid.innerHTML = '';
        libraryGrid.appendChild(fragment);
    }
}

function createCardHTML(track) {
    const isCurrentlyPlaying = playerContext.currentTrack?.id === track.id;
    const playingClass = isCurrentlyPlaying ? 'currently-playing' : '';
    return `
        <div class="recent-media-card ${playingClass}" data-track-id="${track.id}" tabindex="0">
            <div class="album-art">
                <img src="${track.coverURL || getFallbackImage(track.id, track.title)}" alt="${track.title}">
            </div>
            <div class="card-footer">
                <button class="control-btn small card-footer-play-btn" title="${isCurrentlyPlaying && playerContext.isPlaying ? 'Pause' : 'Play'}"><i class="fas ${isCurrentlyPlaying && playerContext.isPlaying ? 'fa-pause' : 'fa-play'}"></i></button>
                <h5>${truncate(track.title || 'Unknown Title', 40)}</h5>
                <button class="control-btn small track-action-btn" title="More options"><i class="fas fa-ellipsis-v"></i></button>
            </div>
        </div>
    `;
}

function attachCardListeners(card, trackId) {
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
}

function attachGridListeners(container) {
    container.querySelectorAll('.recent-media-card').forEach(card => {
        attachCardListeners(card, card.dataset.trackId);
    });
}

export async function getTrackDetailsFromId(id) {
    let track = playerContext.libraryTracksMap.get(id);
    if (track) return track;
    track = await db.tracks.get(id);
    return track || { title: 'Unknown Track', duration: 0 };
}

export function saveTrackChanges(trackId, updatedMetadata) {
    const track = playerContext.libraryTracksMap.get(trackId);
    if (!track) return;
    Object.assign(track, updatedMetadata);

    // Ensure search string is updated if title/artist/album changed
    track.searchStr = `${track.title || ''} ${track.artist || ''} ${track.album || ''}`.toLowerCase();

    db.tracks.put(track);
    updateLibraryCaches();
}

export function toggleTrackSelection(trackId) {
    if (playerContext.selectedTrackIds.has(trackId)) {
        playerContext.selectedTrackIds.delete(trackId);
    } else {
        playerContext.selectedTrackIds.add(trackId);
    }
    updateSelectionBar();
    saveSelection();
}

function saveSelection() {
    localStorage.setItem('genesis_selected_track_ids', JSON.stringify([...playerContext.selectedTrackIds]));
}

export function restoreSelection() {
    const stored = localStorage.getItem('genesis_selected_track_ids');
    if (stored) {
        try {
            const ids = JSON.parse(stored);
            playerContext.selectedTrackIds = new Set(ids);
            updateSelectionBar();
        } catch (e) {
            console.error("Error restoring selection", e);
        }
    }
}

export function clearSelection() {
    playerContext.selectedTrackIds.clear();
    document.querySelectorAll('.track-select-checkbox:checked').forEach(cb => cb.checked = false);
    document.querySelectorAll('.track-list-row.selected').forEach(row => row.classList.remove('selected'));
    updateSelectionBar();
    saveSelection();
}

export async function renderDetailTrackList(tracksOrIds, container, options = {}) {
    if (!container) return;
    if (tracksOrIds.length === 0) {
        container.innerHTML = '<p style="padding: 20px;">No tracks found.</p>';
        return;
    }

    // Clear container before rendering (it was missing this clear, appending duplicates if called twice? openPlaylist removes innerHTML first so it's fine, but safer)
    container.innerHTML = '';

    const trackRows = await Promise.all(tracksOrIds.map(async (item, index) => {
        try {
            let trackData;
            let trackId;

            if (typeof item === 'object') {
                trackData = item;
                trackId = item.id;
            } else {
                trackId = item;
                trackData = await getTrackDetailsFromId(trackId);
            }

            const row = document.createElement('div');
            const isCurrentlyPlaying = playerContext.currentTrack?.id === trackId;
            const isSelected = playerContext.selectedTrackIds.has(trackId);
            const playingClass = isCurrentlyPlaying ? 'currently-playing' : '';
            const selectedClass = isSelected ? 'selected' : '';

            row.className = `track-list-row ${playingClass} ${selectedClass}`;
            row.dataset.id = trackId;

            row.innerHTML = `
                <div class="status-icon">
                    <input type="checkbox" class="track-select-checkbox" data-id="${trackId}" ${isSelected ? 'checked' : ''}>
                </div>
                <div class="status-icon">
                    <button class="row-play-btn"><i class="fas ${isCurrentlyPlaying && playerContext.isPlaying ? 'fa-pause' : 'fa-play'}"></i></button>
                    <div class="playing-bars">
                        <div class="bar bar1"></div>
                        <div class="bar bar2"></div>
                        <div class="bar bar3"></div>
                    </div>
                    <i class="fas fa-music row-index"></i>
                </div>
                <div class="track-row-art">
                    <img src="${trackData.coverURL || getFallbackImage(trackData.id, trackData.title)}" alt="Art">
                </div>
                <div class="track-details-col">
                    <span class="track-title">${truncate(trackData.title || 'Unknown Title', 40)}</span>
                    <span class="track-artist">${truncate(trackData.album || 'Unknown Album', 20)}</span>
                </div>
                <div class="track-title-col desktop-only">
                    <span class="track-title">${truncate(trackData.title || 'Unknown Title', 40)}</span>
                </div>
                <div class="track-artist-col desktop-only">
                    <span class="track-artist">${truncate(trackData.artist || 'Unknown Artist', 20)}</span>
                </div>
                <span class="track-album desktop-only">${truncate(trackData.album || 'Unknown album', 20)}</span>
                <span class="track-year desktop-only">${trackData.year || ''}</span>
                <span class="track-genre desktop-only">${truncate(trackData.genre || 'Unknown genre', 20)}</span>
                <span class="track-duration desktop-only">${formatTime(trackData.duration)}</span>
                <button class="track-action-btn mobile-only"><i class="fas fa-ellipsis-v"></i></button>
            `;

            row.addEventListener('click', e => {
                if (e.target.closest('.track-select-checkbox') || e.target.closest('.track-action-btn')) return;
                // Pass the object if possible to ensure playback can start even if not in library
                if (startPlaybackFn) startPlaybackFn([typeof item === 'object' ? item : trackId]);
            });

            row.querySelector('.track-action-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                if (renderTrackContextMenuFn) renderTrackContextMenuFn(trackId, e.currentTarget, { isFromLibrary: true });
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
    const fragment = document.createDocumentFragment();
    trackRows.filter(Boolean).forEach(row => fragment.appendChild(row));
    container.appendChild(fragment);
    updateSelectionBar();
}

// Generic Full-Screen Grid Modal
export function openSectionModal(type) {
    let title = '';
    let items = [];
    let renderFn = null;

    switch (type) {
        case 'artists':
            title = 'All Artists';
            items = playerContext.cachedArtists;
            renderFn = (artist) => {
                const imgUrl = artist.coverURL || getFallbackImage(artist.name);
                return `
                    <div class="artist-circle-card" data-artist="${artist.name}">
                        <div class="artist-img-container"><img src="${imgUrl}" loading="lazy"></div>
                        <span class="artist-name">${truncate(artist.name, 20)}</span>
                    </div>`;
            };
            break;
        case 'albums':
            title = 'All Albums';
            items = playerContext.cachedAlbums;
            renderFn = (album) => `
                <div class="album-square-card" data-album="${album.name}" data-artist="${album.artist}">
                    <div class="album-img-wrapper"><img src="${album.coverURL || getFallbackImage(album.name)}" loading="lazy"></div>
                    <span class="card-title-text">${truncate(album.name, 20)}</span>
                    <span class="card-subtitle-text">${truncate(album.artist, 20)}</span>
                </div>`;
            break;
    }

    if (!renderFn) return;

    // Create or Get Modal
    let modal = document.getElementById('generic-grid-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'generic-grid-modal';
        modal.className = 'main-section hidden';
        Object.assign(modal.style, {
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            zIndex: '460', backgroundColor: 'var(--surface-color)', display: 'flex', flexDirection: 'column',
            overflowY: 'auto'
        });
        document.querySelector('.main-content').appendChild(modal);
    }

    modal.innerHTML = `
        <div class="section-header" style="padding: 20px; display: flex; align-items: center; justify-content: space-between;">
            <div style="display:flex; align-items:center;">
                 <button id="grid-modal-back-btn" class="btn-secondary" style="margin-right: 15px;"><i class="fas fa-arrow-left"></i></button>
                 <h2>${title}</h2>
            </div>
        </div>
        <div class="grid-modal-content" style="padding: 0 20px 20px; display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 20px;">
            ${items.map(renderFn).join('')}
        </div>
    `;

    modal.classList.remove('hidden');

    modal.querySelector('#grid-modal-back-btn').addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    modal.querySelector('.grid-modal-content').addEventListener('click', (e) => {
        const artistCard = e.target.closest('.artist-circle-card');
        const albumCard = e.target.closest('.album-square-card');

        if (artistCard) {
            import('./artist-manager.js').then(m => m.openArtistByName(artistCard.dataset.artist));
            modal.classList.add('hidden');
        } else if (albumCard) {
            import('./album-manager.js').then(m => m.openAlbum(albumCard.dataset.album, albumCard.dataset.artist));
            modal.classList.add('hidden');
        }
    });
}

