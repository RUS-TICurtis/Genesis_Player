import * as PlaylistManager from './playlist-manager.js';
import * as LibraryManager from './library-manager.js';
import * as PlaybackManager from './playback-manager.js';
import * as AlbumManager from './album-manager.js';
import * as ArtistManager from './artist-manager.js';
import * as QueueManager from './queue-manager.js';
import * as DiscoverManager from './discover-manager.js';
import * as UIManager from './ui-manager.js';
import { db } from './db.js'; // Import the new Dexie DB instance

// --- Shared Context & State ---
// This object will hold state and functions to be shared across the module scope
const playerContext = {
    libraryTracks: [],
    trackQueue: [],
    currentTrackIndex: -1,
    isPlaying: false,
    isShuffled: false,
    selectedTrackIds: new Set(),
    repeatState: 0, // 0: no-repeat, 1: repeat-all, 2: repeat-one. Managed by PlaybackManager
};
const PLAYBACK_STATE_KEY = 'genesis_playback_state';

document.addEventListener('DOMContentLoaded', function() {
    // --- DOM Elements ---
    const audioPlayer = document.getElementById('audio-player');
    const playBtn = document.getElementById('play-btn');
    const playIcon = document.getElementById('play-icon');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const shuffleBtn = document.getElementById('shuffle-btn');
    const repeatBtn = document.getElementById('repeat-btn');
    
    const progressBarContainer = document.getElementById('progress-container');
    const progressFill = document.getElementById('progress-fill');
    const currentTimeEl = document.getElementById('current-time');
    const durationEl = document.getElementById('duration');
    const progressHead = document.getElementById('progress-head');
    
    const volumeSlider = document.getElementById('volume-slider');
    const volumeBtn = document.getElementById('volume-btn');
    const volumePopup = document.getElementById('volume-popup');
    const volumePercentage = document.getElementById('volume-percentage');
    const muteBtn = document.getElementById('mute-btn');
    const volumeIcon = document.getElementById('volume-icon');
    const songTitle = document.getElementById('song-title');
    const artistName = document.getElementById('artist-name');    
    const albumArtImg = document.getElementById('album-art-img');
    const albumArtPlaceholder = document.getElementById('album-art-placeholder');
    const recentMediaGrid = document.getElementById('recent-media-grid');
    const libraryGrid = document.getElementById('library-grid');
    // Playlist View Elements
    const albumsContent = document.querySelector('#albums-section .albums-content');
    const albumsSection = document.getElementById('albums-section');
    const artistsContent = document.querySelector('#artists-section .artists-content');
    const playlistsListContainer = document.getElementById('playlists-section');
    const playlistsList = document.getElementById('playlists-list');
    const sidebarPlaylistsContainer = document.getElementById('sidebar-playlists');
    const playlistDetailView = document.getElementById('playlist-detail-view');
    
    // Navigation & Menu
    const menuItems = document.querySelectorAll('.menu-item');
    const bottomNavItems = document.querySelectorAll('.bottom-nav .nav-item');
    const mainSections = document.querySelectorAll('.main-section');
    
    const openMenuBtn = document.getElementById('open-menu-btn');
    const openMenuDropdown = document.getElementById('open-menu-dropdown');
    const openFilesOption = document.getElementById('open-files-option');
    const openFolderOption = document.getElementById('open-folder-option');
    const openUrlOption = document.getElementById('open-url-option');
    const fileInput = document.getElementById('file-input');
    const folderInput = document.getElementById('folder-input');
    const searchInput = document.getElementById('search-input');
    
    const themeToggle = document.getElementById('theme-toggle-checkbox');
    const profilePicInput = document.getElementById('profile-pic-input');
    const profilePic = document.getElementById('profile-pic');

    // Modals
    const urlModal = document.getElementById('url-modal');
    const urlInput = document.getElementById('url-input');
    const urlLoadBtn = document.getElementById('url-load-btn');
    const urlCancelBtn = document.getElementById('url-cancel-btn');
    
    const msgModal = document.getElementById('message-modal');
    const msgText = document.getElementById('modal-text');
    const msgCloseBtn = document.getElementById('msg-close-btn');

    // Confirmation Modal
    const confirmModal = document.getElementById('confirm-modal');
    const confirmModalTitle = document.getElementById('confirm-modal-title');
    const confirmModalText = document.getElementById('confirm-modal-text');
    const confirmOkBtn = document.getElementById('confirm-ok-btn');
    const confirmCancelBtn = document.getElementById('confirm-cancel-btn');

    const editModal = document.getElementById('edit-modal');
    const editTrackIdInput = document.getElementById('edit-track-id');
    const editTitleInput = document.getElementById('edit-title-input');
    const editArtistInput = document.getElementById('edit-artist-input');
    const editAlbumInput = document.getElementById('edit-album-input');
    const editLyricsInput = document.getElementById('edit-lyrics-input');
    const editSaveBtn = document.getElementById('edit-save-btn');
    const editCancelBtn = document.getElementById('edit-cancel-btn');

    const albumDetailView = document.getElementById('album-detail-view');
    const artistDetailView = document.getElementById('artist-detail-view');

    // Library View Toggles
    const libraryGridViewBtn = document.getElementById('library-grid-view-btn');
    const libraryListViewBtn = document.getElementById('library-list-view-btn');
    const libraryPlayAllBtn = document.getElementById('library-play-all-btn');

    // Selection Bar
    const selectionBar = document.getElementById('selection-action-bar');
    const selectionCount = document.getElementById('selection-count');
    const selectionAddToPlaylistBtn = document.getElementById('selection-add-to-playlist-btn');
    const selectionRemoveBtn = document.getElementById('selection-remove-btn');
    const selectionClearBtn = document.getElementById('selection-clear-btn');

    // Extended Info Panel
    const mainContent = document.querySelector('.main-content');
    const extendedInfoPanel = document.getElementById('extended-info-panel');
    const closeExtendedPanelBtn = document.getElementById('close-extended-panel-btn');
    const playbackBarTrackInfo = document.getElementById('playback-bar-track-info');
    const extendedInfoArt = document.getElementById('extended-info-art');
    const extendedInfoTitle = document.getElementById('extended-info-title');
    const extendedInfoArtist = document.getElementById('extended-info-artist');

    function isValidString(str) {
        if (!str || typeof str !== 'string' || str.trim() === '') {
            return false;
        }
        // Check for the Unicode Replacement Character, which often indicates decoding errors.
        if (str.includes('\uFFFD')) {
            return false;
        }
        return true;
    }

    function savePlaybackState() {
        if (playerContext.currentTrackIndex < 0 || !playerContext.trackQueue[playerContext.currentTrackIndex]) {
            localStorage.removeItem(PLAYBACK_STATE_KEY); // Clear state if no track is active
            return;
        }
        const state = {
            trackId: playerContext.trackQueue[playerContext.currentTrackIndex].id, // Save by ID for robustness
            currentTime: audioPlayer.currentTime,
            volume: audioPlayer.volume,
            isShuffled: playerContext.isShuffled, // repeatState is managed by PlaybackManager
            repeatState: playerContext.repeatState,
            // isPlaying is not saved, to prevent auto-play on refresh
        };
        localStorage.setItem(PLAYBACK_STATE_KEY, JSON.stringify(state));
    }

    async function restoreSession() {
        try {
            // Restore Library directly from Dexie
            const storedTracks = await db.tracks.toArray();
            if (storedTracks) {
                const restorationPromises = storedTracks.map(async (track) => {
                    let trackData = { ...track, objectURL: null };

                    if (track.isURL) {
                        trackData.objectURL = track.url;
                    } else {
                        // The audioBlob is already part of the track object from Dexie
                        if (track.audioBlob) {
                            trackData.objectURL = URL.createObjectURL(track.audioBlob);
                        }
                        // Create a fresh objectURL for the cover art from its blob
                        if (track.albumArtBlob) {
                            trackData.coverURL = URL.createObjectURL(track.albumArtBlob);
                        } else if (track.albumArtUrl) { // Fallback for older tracks
                            // For discovered tracks that haven't been downloaded, use the permanent URL
                            trackData.coverURL = track.albumArtUrl;
                        }
                    }

                    // Parse lyrics if they exist
                    if (trackData.lyrics) {
                        trackData.syncedLyrics = parseLRC(trackData.lyrics);
                    }
                    return trackData;
                });

                playerContext.libraryTracks = await Promise.all(restorationPromises);
                playerContext.trackQueue = [...playerContext.libraryTracks]; // Default play queue to the full library
                UIManager.renderHomeGrid();
                UIManager.renderLibraryGrid();
                // We can load the first library track for display, but not play it.
                if (playerContext.libraryTracks.length > 0) {
                    // Try to restore playback state AFTER library is loaded
                    const savedState = localStorage.getItem(PLAYBACK_STATE_KEY);
                    if (savedState) {
                        const { trackId, currentTime, volume, isShuffled: savedShuffle, repeatState: savedRepeat } = JSON.parse(savedState);
                        const restoredIndex = playerContext.trackQueue.findIndex(t => t.id === trackId);

                        if (restoredIndex > -1) {
                            // Set the state without auto-playing
                            playerContext.currentTrackIndex = restoredIndex;
                            const track = playerContext.trackQueue[restoredIndex];
                            audioPlayer.src = track.objectURL;
                            
                            // Wait for metadata to load before setting currentTime
                            audioPlayer.onloadedmetadata = () => {
                                audioPlayer.currentTime = currentTime;
                                UIManager.updateProgressBarUI(currentTime, audioPlayer.duration);
                                audioPlayer.onloadedmetadata = null; // Clean up listener
                            };

                            UIManager.updatePlaybackBar(track);
                            QueueManager.renderQueueTable();

                            // Restore controls state
                            audioPlayer.volume = volume;
                            volumeSlider.value = volume;
                            playerContext.isShuffled = savedShuffle;
                            PlaybackManager.setShuffleState(savedShuffle);
                            PlaybackManager.setRepeatState(savedRepeat);
                        }
                    } else {
                        // If no saved state, just show the first track
                        UIManager.updatePlaybackBar(playerContext.libraryTracks[0]);
                    }
                }
            }
        } catch (e) {
            console.error("Error restoring session", e);
        }
        
        // Restore profile pic
        const savedPic = localStorage.getItem('genesis_profile_pic');
        if (savedPic && profilePic) profilePic.src = savedPic;
    }

    // --- INITIALIZATION ---

    // Initialize UI Manager
    UIManager.init({
        playerContext,
        dom: { // Pass all relevant DOM elements
            mainSections, menuItems, bottomNavItems, albumDetailView, artistDetailView,
            msgModal, msgText, confirmModal, confirmModalTitle, confirmModalText, confirmOkBtn, confirmCancelBtn,
            recentMediaGrid, libraryGrid, libraryGridViewBtn, libraryListViewBtn,
            songTitle, artistName, albumArtImg, albumArtPlaceholder,
            progressFill, progressHead, currentTimeEl, durationEl,
            extendedInfoPanel, mainContent, playbackBarTrackInfo, closeExtendedPanelBtn,
            extendedInfoArt, extendedInfoTitle, extendedInfoArtist, lyricsContainer: document.getElementById('lyrics-container'),
            editModal, editTrackIdInput, editTitleInput, editArtistInput, editAlbumInput, editLyricsInput,
            selectionBar, selectionCount,
            themeToggle,
        },
        callbacks: { // Pass functions for UI to trigger logic
            playTrackFromId,
            handleContextMenuAction,
            createPlaylistFromTrack: (trackId) => {
                const newName = prompt('Enter new playlist name:');
                if (newName && newName.trim()) {
                    const newPlaylistId = PlaylistManager.createPlaylist(newName, false);
                    if (newPlaylistId) {
                        PlaylistManager.addTrackToPlaylist(newPlaylistId, trackId);
                        UIManager.showMessage(`Added track to new playlist "${newName.trim()}".`);
                        PlaylistManager.refresh();
                    }
                }
            },
            addTrackToPlaylist: (playlistId, trackId) => {
                PlaylistManager.addTrackToPlaylist(playlistId, trackId);
                const playlist = PlaylistManager.getPlaylists()[playlistId];
                UIManager.showMessage(`Added track to "${playlist.name}".`);
            },
            getPlaylists: PlaylistManager.getPlaylists,
        }
    });

    // Initialize Playlist Manager
    PlaylistManager.init({
        playlistsListContainer,
        playlistDetailView,
        playlistsList,
        sidebarPlaylistsContainer,
        createPlaylistBtn: document.getElementById('create-playlist-btn'),
        getLibraryTracks: () => playerContext.libraryTracks,
        showMessage: UIManager.showMessage,
        renderTrackContextMenu: UIManager.renderTrackContextMenu,
        getTrackDetailsFromId: (id) => playerContext.libraryTracks.find(t => t.id === id),
        startPlayback: PlaybackManager.startPlayback,
        showConfirmation: UIManager.showConfirmation
    });

    // Initialize the Library Manager
    LibraryManager.init({
        getDB: () => db, // Pass Dexie instance
        saveTrackToDB: (track) => db.tracks.put(track),
        deleteTrackFromDB: (id) => db.tracks.delete(id),
        showMessage: UIManager.showMessage,
        getLibrary: () => playerContext.libraryTracks,
        setLibrary: (newLibrary) => { playerContext.libraryTracks = newLibrary; },
        onLibraryUpdate: () => {
            UIManager.renderHomeGrid();
            UIManager.renderLibraryGrid();
            ArtistManager.renderArtistsGrid();
            AlbumManager.renderAlbumsGrid();
        }
    });

    // Initialize the Playback Manager
    PlaybackManager.init({
        audioPlayer,
        playerContext,
        playIcon,
        shuffleBtn,
        repeatBtn,
        playBtn,
        nextBtn,
        prevBtn,
        updatePlaybackBar: UIManager.updatePlaybackBar,
        renderQueueTable: QueueManager.renderQueueTable,
        savePlaybackState,
        onTimeUpdate: handleTimeUpdate,
    });

    // Initialize Album and Artist Managers
    AlbumManager.init({
        playerContext, albumsContent, albumDetailView, albumsSection,
        startPlayback: PlaybackManager.startPlayback,
        showMessage: UIManager.showMessage,
        renderDetailTrackList,
    });

    ArtistManager.init({
        playerContext, artistsContent, artistDetailView,
        artistsSection: document.getElementById('artists-section'),
        startPlayback: PlaybackManager.startPlayback,
        showMessage: UIManager.showMessage,
        getTrackDetailsFromId,
        renderDetailTrackList,
    });

    // Initialize Queue and Discover Managers
    QueueManager.init({
        playerContext,
        queueList: document.getElementById('queue-list'),
        queueHeaderTitle: document.getElementById('queue-header-title'),
        queueClearBtn: document.getElementById('queue-clear-btn'),
        queueSavePlaylistBtn: document.getElementById('queue-save-playlist-btn'),
        showMessage: UIManager.showMessage,
        showConfirmation: UIManager.showConfirmation,
        formatTime: UIManager.formatTime,
        loadTrack: PlaybackManager.loadTrack,
        renderTrackContextMenu: UIManager.renderTrackContextMenu,
        PlaylistManager,
    });

    DiscoverManager.init({
        discoverContent: document.querySelector('#discover-section .discover-content'),
        showMessage: UIManager.showMessage,
        startPlayback: PlaybackManager.startPlayback, // For streaming
        downloadAndCacheTrack: downloadAndCacheTrack, // For caching
    });

    /**
     * Downloads a track from the Discover section and adds it to the library.
     * @param {object} track - The track object from the Jamendo API.
     */
    async function downloadAndCacheTrack(track) {
        if (!track || !track.id) {
            UIManager.showMessage('Invalid track data provided.');
            return;
        }

        // Check if track is already in the library
        if (playerContext.libraryTracks.some(t => t.id === track.id.toString())) {
            UIManager.showMessage(`"${track.name}" is already in your library.`);
            return;
        }

        UIManager.showMessage(`Downloading "${track.name}"...`);

        try {
            const response = await fetch(`/download/${track.id}`);
            if (!response.ok) throw new Error(`Server error: ${response.status}`);
            
            const { audioUrl, trackData } = await response.json();
            if (!audioUrl) throw new Error('No audio URL returned from server.');

            // Fetch the actual audio file as a blob
            // We use CORS here because the audioUrl is from a different domain (jamendo.com)
            const audioResponse = await fetch(audioUrl, { mode: 'cors' });
            if (!audioResponse.ok) throw new Error(`Failed to fetch audio from Jamendo. Status: ${audioResponse.status}`);
            const audioBlob = await audioResponse.blob();

            // Create a File-like object to pass to handleFiles
            // Use the original filename from Jamendo if available, otherwise construct one
            const fileName = trackData.name ? `${trackData.name}.mp3` : `${track.id}.mp3`;
            const audioFile = new File([audioBlob], fileName, { type: 'audio/mpeg' });
            
            // Use the existing file handling logic to process and save the track
            await handleFiles([audioFile], { isFromDiscover: true, discoverData: trackData });
            UIManager.showMessage(`Successfully added "${track.name}" to your library!`);
        } catch (error) {
            console.error('Error downloading or caching track:', error);
            UIManager.showMessage(`Failed to add "${track.name}" to library. Please try again.`);
        }
    }

    // --- Theme Toggle Logic ---
    const THEME_KEY = 'genesis_theme';

    if (themeToggle) {
        themeToggle.addEventListener('change', () => {
            const newTheme = themeToggle.checked ? 'dark' : 'light';
            localStorage.setItem(THEME_KEY, newTheme);
            UIManager.applyTheme(newTheme);
        });
    }
    UIManager.applyTheme(localStorage.getItem(THEME_KEY) || 'light'); // Apply saved or default theme

    // --- Navigation Logic ---
    menuItems.forEach(item => {
        item.addEventListener('click', () => UIManager.switchSection(item.dataset.target));
    });
    
    bottomNavItems.forEach(item => {
        item.addEventListener('click', () => UIManager.switchSection(item.dataset.target));
    });

    async function handleRemoveTrack(trackId) {
        const index = playerContext.libraryTracks.findIndex(t => t.id === trackId);
        if (index === -1) return;
        
        const track = playerContext.libraryTracks[index];
        const isCurrentlyPlaying = playerContext.currentTrackIndex > -1 && playerContext.trackQueue[playerContext.currentTrackIndex]?.id === trackId;

        if (isCurrentlyPlaying) {
            audioPlayer.src = '';
            UIManager.updatePlaybackBar(null);
        }

        await LibraryManager.removeTrack(trackId);
        // Also remove from play queue if it exists there
        const queueIndex = playerContext.trackQueue.findIndex(t => t.id === trackId);
        if (queueIndex > -1) {
            playerContext.trackQueue.splice(queueIndex, 1);
            if (queueIndex < playerContext.currentTrackIndex) {
                playerContext.currentTrackIndex--;
            } else if (queueIndex === playerContext.currentTrackIndex) {
                // If it was the current track, stop playback and try to play next
                PlaybackManager.pauseTrack();
                if (playerContext.trackQueue.length > 0) {
                    // Play the next available track
                    PlaybackManager.loadTrack(playerContext.currentTrackIndex % playerContext.trackQueue.length);
                } else {
                    playerContext.currentTrackIndex = -1;
                }
            }
        }

        QueueManager.renderQueueTable();
    }

    async function renderDetailTrackList(trackIds, container, options = {}) {
        if (trackIds.length === 0) {
            container.innerHTML = '<p style="padding: 20px;">No tracks found.</p>';
            return;
        }

        const trackRows = await Promise.all(trackIds.map(async (trackId, index) => {
            try {
                const trackData = await getTrackDetailsFromId(trackId);
                if (!trackData) return null; // Skip if track details not found
                const row = document.createElement('div');
                row.className = 'track-list-row';
                row.dataset.id = trackId;
                let secondaryInfo = options.showAlbum ? trackData.album || 'N/A' : trackData.artist || 'Unknown Artist';

                row.innerHTML = `
                    <input type="checkbox" class="track-select-checkbox" data-id="${trackId}">
                    <span class="track-num">${options.isPlaylist ? '<i class="fas fa-grip-vertical"></i>' : index + 1}</span>
                    <span class="track-title">${trackData.name || 'Unknown Title'}</span>
                    <span class="track-secondary">${secondaryInfo}</span>
                    <span class="track-duration">${UIManager.formatTime(trackData.duration)}</span>
                    <button class="control-btn small track-action-btn" title="More options"><i class="fas fa-ellipsis-v"></i></button>
                `;

                row.addEventListener('click', e => {
                    if (e.target.closest('.track-action-btn') || e.target.type === 'checkbox') {
                        return;
                    }
                    PlaybackManager.startPlayback(trackIds, index);
                });

                row.querySelector('.track-action-btn').addEventListener('click', e => {
                    e.stopPropagation();
                    UIManager.renderTrackContextMenu(trackId, e.currentTarget, { isFromLibrary: true, ...options });
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

        // Add event listener for the "Select All" checkbox in the header
        const selectAllCheckbox = container.previousElementSibling?.querySelector('.select-all-checkbox');
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => {
                const isChecked = e.currentTarget.checked;
                const trackCheckboxes = container.querySelectorAll('.track-select-checkbox');
                
                trackCheckboxes.forEach(checkbox => {
                    const trackId = checkbox.dataset.id;
                    // Only change state if it's not already in the desired state
                    if (checkbox.checked !== isChecked) {
                        checkbox.checked = isChecked;
                        checkbox.closest('.track-list-row').classList.toggle('selected', isChecked);
                        toggleTrackSelection(trackId); // This will add/remove from the Set
                    }
                });
            });
        }
    }

    function toggleTrackSelection(trackId) {
        if (playerContext.selectedTrackIds.has(trackId)) {
            playerContext.selectedTrackIds.delete(trackId);
        } else {
            playerContext.selectedTrackIds.add(trackId);
        }
        UIManager.updateSelectionBar();
    }

    async function handleContextMenuAction(action, trackId, options) {
        const track = await getTrackDetailsFromId(trackId);
        if (!track) return;

        switch (action) {
            case 'play':
                PlaybackManager.startPlayback([trackId], 0);
                break;
            case 'play-next':
                QueueManager.addTrackNext(track);
                break;
            case 'add-to-queue':
                QueueManager.addTrackToQueue(track);
                break;
            case 'remove-from-library':
                const confirmed = await UIManager.showConfirmation(
                    'Remove from Library',
                    `Are you sure you want to permanently remove "<strong>${track.name}</strong>" from your library?`
                );
                if (confirmed) handleRemoveTrack(trackId);
                break;
            case 'remove-from-queue':
                QueueManager.removeTrackFromQueue(trackId);
                break;
            case 'remove-from-playlist':
                if (options.playlistId) {
                    PlaylistManager.removeTrackFromPlaylist(options.playlistId, trackId);
                    UIManager.showMessage(`Removed track from playlist.`);
                }
                break;
            case 'edit-info':
                UIManager.openEditModal(track);
                break;
        }
    }

    function playTrackFromId(trackId, context) {
        const libraryIndex = playerContext.libraryTracks.findIndex(t => t.id === trackId);
        if (libraryIndex === -1 || !playerContext.libraryTracks[libraryIndex].objectURL) {
            UIManager.showMessage("Track is not available for playback.");
            return;
        }

        let trackIdQueue = [];
        let startIndex = 0;

        if (context === 'library' || context === 'recent') {
            // For both library and home/recent, we play from the full library, sorted alphabetically
            trackIdQueue = [...playerContext.libraryTracks].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(t => t.id);
            startIndex = trackIdQueue.findIndex(id => id === trackId);
        } else {
            // Fallback for direct play or other contexts
            trackIdQueue = [trackId];
            startIndex = 0;
        }

        PlaybackManager.startPlayback(trackIdQueue, startIndex > -1 ? startIndex : 0);
    }

    function saveTrackChanges() {
        const trackId = editTrackIdInput.value;
        const track = playerContext.libraryTracks.find(t => t.id === trackId);
        if (!track) return;

        // Update the track object in the main library
        track.name = editTitleInput.value.trim();
        track.artist = editArtistInput.value.trim();
        track.album = editAlbumInput.value.trim();
        track.lyrics = editLyricsInput.value;

        // Re-parse lyrics in case they were changed to LRC format
        track.syncedLyrics = parseLRC(track.lyrics);

        // Update the same track if it's in the play queue
        const queueTrack = playerContext.trackQueue.find(t => t.id === trackId);
        if (queueTrack) {
            Object.assign(queueTrack, track);
        }

        // Persist changes and update UI
        db.tracks.put(track); // Save to Dexie
        UIManager.renderHomeGrid();
        UIManager.renderLibraryGrid();
        QueueManager.renderQueueTable();
        if (playerContext.currentTrackIndex > -1 && playerContext.trackQueue[playerContext.currentTrackIndex].id === trackId) {
            UIManager.updatePlaybackBar(track);
        }
        editModal.classList.add('hidden');
    }

    async function handleFiles(fileList, options = {}) {
        if (!fileList.length) return;

        const openMenuText = document.getElementById('open-menu-text');
        const originalText = openMenuText.textContent;
        openMenuBtn.disabled = true;
        if (!options.isFromDiscover) openMenuText.textContent = 'Processing...';

        try {
            await LibraryManager.handleFiles(fileList, options);
        } catch (error) {
            console.error("Error handling files:", error);
        } finally {
            openMenuBtn.disabled = false;
            openMenuText.textContent = originalText;
        }
    }

    // --- Event Listeners ---
    openMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openMenuDropdown.classList.toggle('hidden');
    });
    document.addEventListener('click', () => openMenuDropdown.classList.add('hidden'));

    openFilesOption.addEventListener('click', () => fileInput.click());
    openFolderOption.addEventListener('click', () => folderInput.click());
    openUrlOption.addEventListener('click', () => {
        urlModal.classList.remove('hidden');
        urlInput.focus();
    });

    fileInput.addEventListener('change', (e) => handleFiles(e.target.files, {}));
    folderInput.addEventListener('change', (e) => handleFiles(e.target.files, {}));

    urlCancelBtn.addEventListener('click', () => urlModal.classList.add('hidden'));
    urlLoadBtn.addEventListener('click', () => {
        const url = urlInput.value.trim();
        if (!url) return;
        const newTrack = {
            id: Date.now().toString(), // URL tracks don't need persistent IDs
            name: url.split('/').pop() || "Stream",
            duration: 0, 
            isURL: true,
            objectURL: url,
            coverURL: null
        };
        playerContext.libraryTracks.push(newTrack);
        UIManager.renderHomeGrid(); // Update UI
        UIManager.renderLibraryGrid();
        urlModal.classList.add('hidden');
        urlInput.value = '';
        // Do not auto-play
    });

    // Profile Picture Handling
    profilePicInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const result = e.target.result;
                profilePic.src = result;
                localStorage.setItem('genesis_profile_pic', result);
            };
            reader.readAsDataURL(file);
        }
    });

    msgCloseBtn.addEventListener('click', () => msgModal.classList.add('hidden'));

    // Edit Modal Listeners
    editSaveBtn.addEventListener('click', saveTrackChanges);
    editCancelBtn.addEventListener('click', () => editModal.classList.add('hidden'));

    // Selection Bar Listeners
    if (selectionClearBtn) {
        selectionClearBtn.addEventListener('click', UIManager.clearSelection);
    }

    if (selectionRemoveBtn) {
        selectionRemoveBtn.addEventListener('click', async () => {
            const count = playerContext.selectedTrackIds.size;
            const confirmed = await UIManager.showConfirmation(
                'Remove Tracks',
                `Are you sure you want to permanently remove ${count} selected track(s) from your library?`
            );
            if (confirmed) {
                const removalPromises = Array.from(playerContext.selectedTrackIds).map(id => handleRemoveTrack(id));
                await Promise.all(removalPromises);
                UIManager.showMessage(`Removed ${count} track(s).`);
                UIManager.clearSelection();
            }
        });
    }

    if (selectionAddToPlaylistBtn) {
        selectionAddToPlaylistBtn.addEventListener('click', () => {
            // This is a simplified version. A proper implementation would show a playlist modal.
            const playlistId = prompt("Enter the ID of the playlist to add tracks to (for now).");
            if (playlistId) {
                playerContext.selectedTrackIds.forEach(trackId => PlaylistManager.addTrackToPlaylist(playlistId, trackId));
                UIManager.showMessage(`Added ${playerContext.selectedTrackIds.size} tracks to the playlist.`);
                UIManager.clearSelection();
            }
        });
    }

    function handleTimeUpdate() {
        const { currentTime, duration } = audioPlayer;
        if (!isNaN(duration)) {
            UIManager.updateProgressBarUI(currentTime, duration);
            savePlaybackState(); // Periodically save progress
            UIManager.updateLyrics(currentTime); // Sync lyrics
        }
    }
    
    // --- Drag and Click to Seek ---
    let isDragging = false;

    const seek = (e) => {
        if (!audioPlayer.duration) return;
        const rect = progressBarContainer.getBoundingClientRect();
        // Use touch event if available, otherwise mouse event
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        let position = (clientX - rect.left) / rect.width;
        position = Math.max(0, Math.min(1, position)); // Clamp between 0 - 1
        
        audioPlayer.currentTime = position * audioPlayer.duration;
        
        // We can also manually update the UI here for a snappier feel
        // as timeupdate can have a slight delay.
        const pct = position * 100;
        progressFill.style.width = `${pct}%`;
        if(progressHead) progressHead.style.left = `${pct}%`;
        currentTimeEl.textContent = UIManager.formatTime(audioPlayer.currentTime);
    };

    progressBarContainer.addEventListener('mousedown', (e) => {
        isDragging = true;
        seek(e);
        e.preventDefault(); // Prevents text selection
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            seek(e);
        }
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });

    progressBarContainer.addEventListener('touchstart', (e) => {
        isDragging = true;
        seek(e);
        e.preventDefault();
    });

    document.addEventListener('touchmove', (e) => {
        if (isDragging) {
            seek(e);
            e.preventDefault(); // Prevent scrolling while dragging
        }
    });

    document.addEventListener('touchend', () => {
        isDragging = false;
    });

    volumeSlider.addEventListener('input', (e) => {
        const volumeValue = parseFloat(e.target.value);
        audioPlayer.volume = volumeValue;
        audioPlayer.muted = false; // Unmute when slider is used
        volumePercentage.textContent = Math.round(volumeValue * 100);
        savePlaybackState();

        const muteIcon = muteBtn.querySelector('i');

        if (volumeValue > 0.5) {
            volumeIcon.className = 'fas fa-volume-up';
        } else if (volumeValue > 0) {
            volumeIcon.className = 'fas fa-volume-down';
        } else {
            volumeIcon.className = 'fas fa-volume-mute';
        }
        // Sync mute button icon
        if (muteIcon) {
            muteIcon.className = volumeIcon.className;
        }
    });

    muteBtn.addEventListener('click', () => {
        audioPlayer.muted = !audioPlayer.muted;
        const muteIcon = muteBtn.querySelector('i');
        if (audioPlayer.muted) {
            muteIcon.className = 'fas fa-volume-mute';
            volumeIcon.className = 'fas fa-volume-mute';
            volumePercentage.textContent = '0';
            muteBtn.title = "Unmute";
        } else {
            // Restore icon based on current volume
            volumePercentage.textContent = Math.round(audioPlayer.volume * 100);
            const volumeValue = audioPlayer.volume;
            if (volumeValue > 0.5) {
                volumeIcon.className = 'fas fa-volume-up';
                muteIcon.className = 'fas fa-volume-up';
            } else if (volumeValue > 0) {
                volumeIcon.className = 'fas fa-volume-down';
                muteIcon.className = 'fas fa-volume-down';
            } else {
                volumeIcon.className = 'fas fa-volume-mute';
                muteIcon.className = 'fas fa-volume-mute';
            }
            muteBtn.title = "Mute";
        }
    });

    volumeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        volumePopup.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
        if (!volumePopup.contains(e.target) && !volumeBtn.contains(e.target)) {
            volumePopup.classList.remove('active');
        }
    });

    // Sidebar Toggle
    const sidebar = document.querySelector('.sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('active');
        });
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 992 && !sidebar.contains(e.target) && !sidebarToggle.contains(e.target)) {
                sidebar.classList.remove('active');
            }
        });
    }

    // Initialize
    restoreSession();

    const searchDropdown = document.getElementById('search-dropdown');

    sidebarPlaylistsContainer.addEventListener('click', (e) => UIManager.switchSection('playlists-section'))

    let highlightedSearchIndex = -1;

    // Simple debounce helper
    function debounce(fn, ms = 200) {
        let t;
        return (...args) => {
            clearTimeout(t);
            t = setTimeout(() => fn(...args), ms);
        };
    }

    function renderSearchDropdown() {
        const query = searchInput.value.trim().toLowerCase();
        if (!query) {
            searchDropdown.classList.add('hidden');
            highlightedSearchIndex = -1;
            searchDropdown.innerHTML = '';
            return;
        }

        const results = playerContext.trackQueue
            .map((t, idx) => ({ t, idx }))
            .filter(({ t }) => t.name.toLowerCase().includes(query))
            .slice(0, 8);

        if (results.length === 0) {
            searchDropdown.innerHTML = `<div class="no-results">No results found for "${query}"</div>`;
            highlightedSearchIndex = -1;
            searchDropdown.classList.remove('hidden');
            return;
        }

        searchDropdown.innerHTML = results.map(({ t, idx }) => {
            const duration = t.duration ? UIManager.formatTime(t.duration) : '';
            const icon = t.isURL ? '<i class="fas fa-globe"></i>' : '<i class="fas fa-music"></i>';
            return `
                <div class="result-item" data-idx="${idx}" role="option">
                    ${icon}
                    <div class="label">${t.name}</div>
                    <div class="meta">${duration}</div>
                </div>
            `;
        }).join('');
        highlightedSearchIndex = -1; // Reset on new render
        searchDropdown.classList.remove('hidden');

        // Attach click handlers for results
        searchDropdown.querySelectorAll('.result-item').forEach(el => {
            el.addEventListener('click', (e) => {
                const idx = parseInt(el.dataset.idx, 10);
                if (!isNaN(idx) && playerContext.trackQueue[idx]?.objectURL) {
                    PlaybackManager.loadTrack(idx);
                    searchDropdown.classList.add('hidden');
                    QueueManager.renderQueueTable();
                } else {
                    UIManager.showMessage('Selected track is not available. Re-open the file.');
                }
            });
        });

        highlightedSearchIndex = -1;
    }

    const handleSearchInput = debounce(() => {
        renderSearchDropdown();
    }, 180);

    // Replace earlier single listener with combined behavior
    // searchInput.removeEventListener && searchInput.removeEventListener('input', renderQueue);
    searchInput.addEventListener('input', handleSearchInput);

    // Hide dropdown when clicking outside search bar / dropdown
    document.addEventListener('click', (e) => {
        const withinSearch = e.target.closest('.search-bar') || e.target.closest('#search-dropdown');
        if (!withinSearch) searchDropdown.classList.add('hidden');
    });

    // Prevent document click handlers from closing dropdown when interacting within search
    searchInput.addEventListener('click', (e) => {
        e.stopPropagation();
        renderSearchDropdown();
    });

    // Keyboard navigation for search dropdown
    searchInput.addEventListener('keydown', (e) => {
        const items = searchDropdown.querySelectorAll('.result-item');
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (highlightedSearchIndex < items.length - 1) {
                highlightedSearchIndex++;
            } else {
                highlightedSearchIndex = 0; // Wrap to top
            }
            updateSearchHighlight(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (highlightedSearchIndex > 0) {
                highlightedSearchIndex--;
            } else {
                highlightedSearchIndex = items.length - 1; // Wrap to bottom
            }
            updateSearchHighlight(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlightedSearchIndex > -1 && items[highlightedSearchIndex]) {
                items[highlightedSearchIndex].click(); // Trigger click on the highlighted item
            }
        } else if (e.key === 'Escape') {
            searchDropdown.classList.add('hidden');
        }
    });

    function updateSearchHighlight(items) {
        items.forEach((item, index) => {
            if (index === highlightedSearchIndex) {
                item.classList.add('highlighted');
                // Ensure the highlighted item is visible in the dropdown
                item.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest'
                });
            } else {
                item.classList.remove('highlighted');
            }
        });
    }

    // ===================================
    // 4. Keyboard Shortcuts Feature
    // ===================================

    document.addEventListener('keydown', (event) => {
        // Prevent key controls from firing if the user is typing in an input field (e.g., in a modal)
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
            return;
        }

        switch (event.key) {
            case ' ': // Spacebar for Play/Pause
                event.preventDefault(); // Prevents the page from scrolling down
                // Call your existing play/pause function
                PlaybackManager.togglePlayPause();
                break;
            
            case 'ArrowRight': // Right Arrow for Next Track
                event.preventDefault(); 
                if (nextBtn) PlaybackManager.nextTrack(); // Assumes you have a nextTrack() function
                break;

            case 'ArrowLeft': // Left Arrow for Previous Track
                event.preventDefault();
                if (prevBtn) PlaybackManager.prevTrack(); // Assumes you have a prevTrack() function
                break;

            case 'ArrowUp': // Up Arrow for Volume Up
                event.preventDefault();
                // Ensure volume is between 0.0 and 1.0
                audioPlayer.volume = Math.min(1.0, audioPlayer.volume + 0.1);
                volumeSlider.value = audioPlayer.volume; // Update the UI slider
                break;

            case 'ArrowDown': // Down Arrow for Volume Down
                event.preventDefault();
                // Ensure volume is between 0.0 and 1.0
                audioPlayer.volume = Math.max(0.0, audioPlayer.volume - 0.1);
                volumeSlider.value = audioPlayer.volume; // Update the UI slider
                break;

            // Optional: 'M' for Mute
            case 'm':
            case 'M':
                event.preventDefault();
                // Toggle mute status
                audioPlayer.muted = !audioPlayer.muted;
                // You may want to update a mute button's icon here
                break;

            default:
                // Do nothing for other keys
                return;
        }
    });

    if (libraryPlayAllBtn) {
        libraryPlayAllBtn.addEventListener('click', () => {
            if (playerContext.libraryTracks.length > 0) {
                PlaybackManager.startPlayback(playerContext.libraryTracks.map(t => t.id), 0);
                UIManager.showMessage(`Playing all ${playerContext.libraryTracks.length} tracks from your library.`);
            }
        });
    }
});
// --- Functions for other modules ---

/**
 * Parses LRC formatted text into an array of timed lyric objects.
 * @param {string} lrcText The raw LRC string.
 * @returns {Array<{time: number, text: string}>}
 */
export function parseLRC(lrcText) {
    if (!lrcText || typeof lrcText !== 'string') return [];

    const lines = lrcText.split('\n');
    const syncedLyrics = [];
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
    lines.forEach(line => {
        const match = line.match(timeRegex);
        if (match) {
            const minutes = parseInt(match[1], 10);
            const seconds = parseInt(match[2], 10);
            const milliseconds = parseInt(match[3].padEnd(3, '0'), 10);
            const time = minutes * 60 + seconds + milliseconds / 1000;
            const text = line.replace(timeRegex, '').trim();
            if (text) {
                syncedLyrics.push({ time, text });
            }
        }
    });

    return syncedLyrics.sort((a, b) => a.time - b.time);
}

/**
 * Retrieves the full track object from the library by its ID.
 * @param {string} trackId The ID of the track to find.
 * @returns {Promise<object>} A promise that resolves with the track data.
 */
async function getTrackDetailsFromId(trackId) {
    // First check in-memory library
    let track = playerContext.libraryTracks.find(t => t.id === trackId);
    if (track) return track;
    // If not found, check the database (for detail views)
    return await db.tracks.get(trackId);
}

const startPlayback = PlaybackManager.startPlayback;
const loadTrack = PlaybackManager.loadTrack;

window.addEventListener('online', () => console.log('Back online'));
window.addEventListener('offline', () => console.log('Offline mode'));
