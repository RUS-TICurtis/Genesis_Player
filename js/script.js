import { playerContext } from './state.js';
import * as Utils from './utils.js';
import * as UI from './ui-manager.js';
import * as LibraryManager from './library-manager.js';
import * as PlaybackManager from './playback-manager.js';
import * as PlaylistManager from './playlist-manager.js';
import * as QueueManager from './queue-manager.js';
import * as AlbumManager from './album-manager.js';
import * as ArtistManager from './artist-manager.js';
import * as DiscoverManager from './discover-manager.js';
import * as OnboardingManager from './onboarding-manager.js';
import * as ProfileManager from './profile-manager.js';
import * as ContextMenuManager from './context-menu-manager.js';
import { refreshLyrics, openManualLyricsSearch } from './lyrics-manager.js';

document.addEventListener('DOMContentLoaded', async function () {

    const runAfterPaint = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));
    const runWhenIdle = (fn, timeout = 1200) => {
        if ('requestIdleCallback' in window) {
            requestIdleCallback(fn, { timeout });
        } else {
            setTimeout(fn, 1);
        }
    };
    const deferUserTask = (fn) => setTimeout(fn, 0);
    let backendBootstrapStarted = false;
    const DROP_IMPORT_SECTION_IDS = ['home-section', 'library-section', 'queue-view-section'];

    const getCurrentTrack = () => playerContext.trackQueue[playerContext.currentTrackIndex] || null;
    const getDropImportSections = () => DROP_IMPORT_SECTION_IDS
        .map((id) => document.getElementById(id))
        .filter(Boolean);
    const getActiveDropSection = () => document.querySelector('#home-section:not(.hidden), #library-section:not(.hidden), #queue-view-section:not(.hidden)');
    const clearDropTargets = () => {
        getDropImportSections().forEach((section) => section.classList.remove('file-drop-active'));
        document.body.classList.remove('dragover');
    };
    const isFileDragEvent = (event) => {
        const dataTransfer = event?.dataTransfer;
        if (!dataTransfer) return false;

        const types = Array.from(dataTransfer.types || []).map((type) => String(type).toLowerCase());
        if (types.includes('files')) return true;

        const items = Array.from(dataTransfer.items || []);
        if (items.some((item) => item.kind === 'file')) return true;

        return Boolean(dataTransfer.files && dataTransfer.files.length > 0);
    };
    const getDroppedFiles = (event) => {
        const dataTransfer = event?.dataTransfer;
        if (!dataTransfer) return [];

        if (dataTransfer.files && dataTransfer.files.length > 0) {
            return Array.from(dataTransfer.files);
        }

        const items = Array.from(dataTransfer.items || []);
        return items
            .filter((item) => item.kind === 'file')
            .map((item) => item.getAsFile())
            .filter(Boolean);
    };
    const resolveDropTargetSection = (target) => {
        const targetSection = target?.closest?.('#home-section, #library-section, #queue-view-section');
        if (targetSection) return targetSection;

        const activeSection = getActiveDropSection();
        if (activeSection) return activeSection;

        return document.getElementById('library-section');
    };
    const appendTracksToQueue = (tracks = []) => {
        if (!tracks.length) return;

        const shouldInitializeQueue = playerContext.trackQueue.length === 0;
        playerContext.trackQueue.push(...tracks);
        QueueManager.renderQueueTable();

        if (shouldInitializeQueue && playerContext.currentTrackIndex === -1) {
            PlaybackManager.loadTrack(0, false);
        } else {
            PlaybackManager.savePlaybackState();
        }
    };
    const importFilesForSection = async (fileList, sectionId = 'library-section') => {
        const newTracks = await LibraryManager.handleFiles(fileList);
        if (!newTracks.length) return;

        if (sectionId === 'queue-view-section') {
            appendTracksToQueue(newTracks);
        }
    };

    const syncNativePlaybackControls = () => {
        const audio = document.getElementById('audio-player');
        const track = getCurrentTrack();
        const hasTrack = Boolean(track);

        if (window.electronAPI?.updateTaskbarPlayback) {
            window.electronAPI.updateTaskbarPlayback({
                hasTrack,
                isPlaying: Boolean(playerContext.isPlaying),
                title: track?.title || '',
                artist: track?.artist || '',
                isShuffled: Boolean(playerContext.isShuffled),
                repeatState: Number(playerContext.repeatState || 0)
            });
        }

        if (!('mediaSession' in navigator)) return;

        try {
            // Synchronize the actual playback state with the OS
            const isPlaying = !audio.paused && !audio.ended && audio.readyState > 2;
            navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
            
            playerContext.isPlaying = isPlaying;

            if (hasTrack) {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: track.title || 'Unknown Title',
                    artist: track.artist || 'Unknown Artist',
                    album: track.album || 'Genesis Player',
                    artwork: track.coverURL ? [
                        { src: track.coverURL, sizes: '96x96', type: 'image/png' },
                        { src: track.coverURL, sizes: '128x128', type: 'image/png' },
                        { src: track.coverURL, sizes: '192x192', type: 'image/png' },
                        { src: track.coverURL, sizes: '256x256', type: 'image/png' },
                        { src: track.coverURL, sizes: '384x384', type: 'image/png' },
                        { src: track.coverURL, sizes: '512x512', type: 'image/png' }
                    ] : []
                });
            } else {
                navigator.mediaSession.metadata = null;
            }

            if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
                navigator.mediaSession.setPositionState({
                    duration: audio.duration,
                    playbackRate: audio.playbackRate || 1.0,
                    position: audio.currentTime || 0
                });
            }
        } catch (e) {
            // Some browsers/platforms partially support Media Session APIs.
        }
    };

    const initNativePlaybackControlHandlers = () => {
        if (window.electronAPI?.onTaskbarControl) {
            const unsub = window.electronAPI.onTaskbarControl((action) => {
                switch (action) {
                    case 'previous':
                        PlaybackManager.prevTrack();
                        break;
                    case 'toggle-play':
                        playerContext.isPlaying ? PlaybackManager.pauseTrack() : PlaybackManager.playTrack();
                        break;
                    case 'next':
                        PlaybackManager.nextTrack();
                        break;
                    case 'toggle-repeat':
                        PlaybackManager.toggleRepeat();
                        break;
                    case 'toggle-shuffle':
                        PlaybackManager.toggleShuffle();
                        break;
                }
            });

            window.addEventListener('beforeunload', () => {
                if (typeof unsub === 'function') unsub();
            });
        }

        if ('mediaSession' in navigator) {
            const safeSetAction = (action, handler) => {
                try {
                    navigator.mediaSession.setActionHandler(action, handler);
                } catch (e) {
                    // Action not supported by this browser/platform.
                }
            };

            safeSetAction('play', () => PlaybackManager.playTrack());
            safeSetAction('pause', () => PlaybackManager.pauseTrack());
            safeSetAction('previoustrack', () => PlaybackManager.prevTrack());
            safeSetAction('nexttrack', () => PlaybackManager.nextTrack());
            
            // Support seeking from the notification/lock screen progress bar
            safeSetAction('seekto', (details) => {
                const audio = document.getElementById('audio-player');
                if (!audio || !Number.isFinite(details.seekTime)) return;
                
                audio.currentTime = details.seekTime;
                // Update the UI and position state immediately after seek
                syncNativePlaybackControls();
                PlaybackManager.getTimeHandler()(); 
            });

            safeSetAction('seekbackward', (details) => {
                const audio = document.getElementById('audio-player');
                if (!audio) return;
                const offset = details?.seekOffset || 10;
                audio.currentTime = Math.max((audio.currentTime || 0) - offset, 0);
            });
            safeSetAction('seekforward', (details) => {
                const audio = document.getElementById('audio-player');
                if (!audio) return;
                const offset = details?.seekOffset || 10;
                const duration = Number.isFinite(audio.duration) ? audio.duration : Infinity;
                audio.currentTime = Math.min((audio.currentTime || 0) + offset, duration);
            });
            safeSetAction('stop', () => {
                const audio = document.getElementById('audio-player');
                if (!audio) return;
                PlaybackManager.pauseTrack();
                audio.currentTime = 0;
            });
        }
    };

    // --- 1. Dependency Injection / Wiring ---

    // Library needs Playback (for card clicks) and ContextMenu
    LibraryManager.setLibraryDependencies(
        PlaybackManager.startPlayback,
        ContextMenuManager.renderTrackContextMenu
    );

    // Playlist needs Playback and ContextMenu closure
    PlaylistManager.setPlaylistDependencies(
        PlaybackManager.startPlayback,
        ContextMenuManager.closeContextMenu
        // UI.openAddToPlaylistModal is used internally by importing it from playlist-manager itself if implemented there
        // or we need to expose it. For now, assuming internal imports work.
    );

    // Album and Artist need Playback
    AlbumManager.setAlbumDependencies(PlaybackManager.startPlayback);
    ArtistManager.setArtistDependencies(PlaybackManager.startPlayback);

    // Discover needs Playback
    DiscoverManager.setDiscoverDependencies(PlaybackManager.startPlayback);

    // Queue needs Playback actions
    QueueManager.setQueueActions(
        PlaybackManager.loadTrack,
        PlaybackManager.removeFromQueue
    );

    ProfileManager.initProfileListeners();
    OnboardingManager.initOnboarding({
        onComplete: () => {
            LibraryManager.renderHomeGrid();
            DiscoverManager.renderDiscoverGrid('', true);
        }
    });

    // Context Menu registers itself to be closed by UI interactions
    // In ContextMenuManager, we export setActiveContextMenu. 
    // We can use a global click listener here to close it.
    window.setActiveContextMenu = ContextMenuManager.setActiveContextMenu;

    // --- 2. Initialization ---

    // Defer heavy startup work to reduce INP impact
    const initLibraryAndPlayback = async () => {
        await LibraryManager.loadLibraryFromDB();
        LibraryManager.renderHomeGrid();
        LibraryManager.renderLibraryGrid();
        AlbumManager.renderAlbumsGrid();
        ArtistManager.renderArtistsGrid();
        LibraryManager.restoreSelection();
        await PlaybackManager.restorePlaybackState();
    };

    const startDeferredBackendBootstrap = (mode = 'deferred') => {
        if (backendBootstrapStarted) return;
        backendBootstrapStarted = true;

        const boot = () => DiscoverManager.renderDiscoverGrid('', true);

        if (mode === 'immediate') {
            deferUserTask(boot);
            return;
        }

        const scheduleBoot = () => {
            runWhenIdle(() => {
                setTimeout(boot, 1200);
            }, 2000);
        };

        if (document.readyState === 'complete') {
            scheduleBoot();
        } else {
            window.addEventListener('load', scheduleBoot, { once: true });
        }
    };

    runAfterPaint(() => {
        runWhenIdle(() => {
            initLibraryAndPlayback();
            PlaylistManager.loadPlaylists();
            PlaylistManager.renderPlaylists();
            ProfileManager.renderProfile();
        });
    });

    // Restore Library View Mode
    const savedLibraryView = localStorage.getItem('genesis_library_view') || 'grid';
    UI.switchLibraryView(savedLibraryView);

    const discoverSearchInput = document.getElementById('discover-search-input');
    const discoverSearchBtn = document.getElementById('discover-search-btn');

    // Restore cached discover content without touching the backend yet.
    runWhenIdle(() => {
        if (DiscoverManager.loadDiscoverFromStorage()) {
            DiscoverManager.renderDiscoverCards(playerContext.discoverTracks);
        }
    });

    // Let the UI finish rendering before we start backend-driven discover work.
    startDeferredBackendBootstrap();

    document.addEventListener('genesis:taste-profile-updated', () => {
        LibraryManager.renderHomeGrid();
    });

    // Restore Search
    UI.restoreSearch();
    const discoverLastSearch = localStorage.getItem('genesis_discover_search');
    if (discoverLastSearch && discoverSearchInput) {
        discoverSearchInput.value = discoverLastSearch;
    }

    // Restore UI State (Last Section)
    const lastSection = localStorage.getItem('genesis_active_section');
    const lastDetailId = localStorage.getItem('genesis_active_detail_id');

    if (lastSection) {
        if (lastSection === 'playlist-detail-view' && lastDetailId) {
            PlaylistManager.openPlaylistView(lastDetailId);
        } else if (lastSection === 'album-detail-view' && lastDetailId) {
            AlbumManager.openAlbumByName(lastDetailId);
        } else if (lastSection === 'artist-detail-view' && lastDetailId) {
            ArtistManager.openArtistByName(lastDetailId);
        } else if (lastSection === 'favorites-section') {
            deferUserTask(() => LibraryManager.renderFavoritesGrid());
            UI.switchSection('favorites-section');
        } else {
            UI.switchSection(lastSection);
        }
    } else {
        UI.switchSection('home-section');
    }


    // --- 3. Event Listeners ---

    // Navigation
    const menuItems = UI.elements.menuItems();
    const bottomNavItems = UI.elements.bottomNavItems();
    [...menuItems, ...bottomNavItems].forEach(item => {
        item.addEventListener('click', () => {
            const target = item.dataset.target;
            UI.switchSection(target);
            // Auto-hide sidebar on mobile
            if (window.innerWidth <= 768) {
                const sidebar = document.querySelector('.sidebar');
                if (sidebar) sidebar.classList.remove('active');
            }
            // Special handling for discover tab
            if (target === 'discover-section') {
                if (!backendBootstrapStarted) {
                    startDeferredBackendBootstrap('immediate');
                } else if (playerContext.discoverTracks.length === 0) {
                    deferUserTask(() => DiscoverManager.renderDiscoverGrid());
                }
            }
            // Special handling for favorites
            if (target === 'favorites-section') {
                deferUserTask(() => LibraryManager.renderFavoritesGrid());
            }
        });
    });

    // Theme
    if (UI.elements.themeToggle()) {
        UI.elements.themeToggle().addEventListener('change', () => {
            const newTheme = UI.elements.themeToggle().checked ? 'dark' : 'light';
            localStorage.setItem('genesis_theme', newTheme);
            UI.applyTheme(newTheme);
        });
    }
    // Apply initial theme
    UI.applyTheme(localStorage.getItem('genesis_theme') || 'light');

    // Sidebar
    const sidebar = document.querySelector('.sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    if (sidebarToggle && sidebar) {
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

    // Audio Player Events
    const audioPlayer = document.getElementById('audio-player');
    if (audioPlayer) {
        audioPlayer.addEventListener('timeupdate', PlaybackManager.getTimeHandler());
        audioPlayer.addEventListener('ended', () => PlaybackManager.nextTrack());
        
        // Vital for Audio Focus: When the system pauses the audio (e.g., incoming call), 
        // the audio element emits 'pause'. We must sync our internal UI state.
        audioPlayer.addEventListener('play', () => syncNativePlaybackControls());
        audioPlayer.addEventListener('pause', () => syncNativePlaybackControls());
        audioPlayer.addEventListener('loadedmetadata', syncNativePlaybackControls);
        audioPlayer.addEventListener('ratechange', syncNativePlaybackControls);
    }

    initNativePlaybackControlHandlers();
    document.addEventListener('genesis-playback-state-changed', syncNativePlaybackControls);
    syncNativePlaybackControls();

    // Playback Controls
    const togglePlay = () => (playerContext.isPlaying ? PlaybackManager.pauseTrack() : PlaybackManager.playTrack());
    document.getElementById('play-btn')?.addEventListener('click', togglePlay);
    document.getElementById('mobile-play-btn')?.addEventListener('click', togglePlay);
    document.getElementById('extended-play-btn')?.addEventListener('click', togglePlay);

    document.getElementById('next-btn')?.addEventListener('click', PlaybackManager.nextTrack);
    document.getElementById('prev-btn')?.addEventListener('click', PlaybackManager.prevTrack);
    document.getElementById('shuffle-btn')?.addEventListener('click', PlaybackManager.toggleShuffle);
    document.getElementById('repeat-btn')?.addEventListener('click', PlaybackManager.toggleRepeat);
    document.getElementById('extended-next-btn')?.addEventListener('click', PlaybackManager.nextTrack);
    document.getElementById('extended-prev-btn')?.addEventListener('click', PlaybackManager.prevTrack);
    document.getElementById('extended-shuffle-btn')?.addEventListener('click', PlaybackManager.toggleShuffle);
    document.getElementById('extended-repeat-btn')?.addEventListener('click', PlaybackManager.toggleRepeat);

    // Progress Bar Drag
    PlaybackManager.initProgressBarListeners();

    // Volume Controls
    const volumeBtn = document.getElementById('volume-btn');
    const volumePopup = document.getElementById('volume-popup');
    const volumeSlider = document.getElementById('volume-slider');
    const volumeBoostSlider = document.getElementById('volume-boost-slider');
    const muteBtn = document.getElementById('mute-btn');
    const volumeIcon = document.getElementById('volume-icon');
    const muteBtnIcon = muteBtn?.querySelector('i');
    const updateVolumeUI = () => {
        const effectiveVolume = audioPlayer.muted ? 0 : audioPlayer.volume;
        const volumePercentage = document.getElementById('volume-percentage');
        const volumeBoostPercentage = document.getElementById('volume-boost-percentage');
        if (volumePercentage) volumePercentage.textContent = Math.round(effectiveVolume * 100);
        if (volumeBoostPercentage) volumeBoostPercentage.textContent = Math.round(PlaybackManager.getVolumeBoost() * 100);
        if (volumeBoostSlider) volumeBoostSlider.value = PlaybackManager.getVolumeBoost();

        let iconClass = 'fas fa-volume-up';
        if (effectiveVolume === 0) iconClass = 'fas fa-volume-mute';
        else if (effectiveVolume < 0.5) iconClass = 'fas fa-volume-down';

        if (volumeIcon) volumeIcon.className = iconClass;
        if (muteBtnIcon) muteBtnIcon.className = iconClass;
        if (muteBtn) muteBtn.title = audioPlayer.muted || audioPlayer.volume === 0 ? 'Unmute' : 'Mute';
    };

    if (volumeBtn && volumePopup) {
        volumeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (volumeSlider) volumeSlider.value = audioPlayer.volume;
            if (volumeBoostSlider) volumeBoostSlider.value = PlaybackManager.getVolumeBoost();
            updateVolumeUI();
            volumePopup.classList.toggle('active');
        });
        document.addEventListener('click', (e) => {
            if (!volumePopup.contains(e.target) && !volumeBtn.contains(e.target)) {
                volumePopup.classList.remove('active');
            }
        });
    }

    if (volumeSlider) {
        volumeSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            audioPlayer.volume = val;
            audioPlayer.muted = false;
            PlaybackManager.syncEnhancedVolume();
            PlaybackManager.savePlaybackState();
            updateVolumeUI();
        });
    }

    if (volumeBoostSlider) {
        volumeBoostSlider.addEventListener('input', (e) => {
            const boost = parseFloat(e.target.value);
            PlaybackManager.setVolumeBoost(boost);
            audioPlayer.muted = false;
            PlaybackManager.syncEnhancedVolume();
            PlaybackManager.savePlaybackState();
            updateVolumeUI();
        });
    }

    if (muteBtn) {
        muteBtn.addEventListener('click', () => {
            audioPlayer.muted = !audioPlayer.muted;
            PlaybackManager.syncEnhancedVolume();
            PlaybackManager.savePlaybackState();
            updateVolumeUI();
        });
    }

    updateVolumeUI();

    // Search
    const searchInput = UI.elements.searchInput();
    if (searchInput) {
        let highlightedSearchIndex = -1;
        const searchDropdown = UI.elements.searchDropdown();

        const handleSearchInput = Utils.debounce(() => {
            const query = searchInput.value.trim();
            localStorage.setItem('genesis_last_search', query);
            highlightedSearchIndex = -1;
            UI.renderSearchDropdown();
        }, 180);
        searchInput.addEventListener('input', handleSearchInput);
        searchInput.addEventListener('click', (e) => {
            e.stopPropagation();
            highlightedSearchIndex = -1;
            UI.renderSearchDropdown();
        });

        if (searchDropdown) {
            searchDropdown.addEventListener('click', (e) => {
                const item = e.target.closest('.result-item');
                if (!item) return;
                const { trackId } = item.dataset;
                if (!trackId) return;
                PlaybackManager.startPlayback([trackId]);
                searchDropdown.classList.add('hidden');
            });
        }

        // Keyboard nav for search
        searchInput.addEventListener('keydown', (e) => {
            const items = searchDropdown?.querySelectorAll('.result-item') || [];
            if (items.length === 0) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                highlightedSearchIndex = (highlightedSearchIndex + 1) % items.length;
                UI.updateSearchHighlight(items, highlightedSearchIndex);
                return;
            }

            if (e.key === 'ArrowUp') {
                e.preventDefault();
                highlightedSearchIndex = highlightedSearchIndex <= 0 ? items.length - 1 : highlightedSearchIndex - 1;
                UI.updateSearchHighlight(items, highlightedSearchIndex);
                return;
            }

            if (e.key === 'Enter') {
                e.preventDefault();
                const targetIndex = highlightedSearchIndex >= 0 ? highlightedSearchIndex : 0;
                items[targetIndex]?.click();
                return;
            }

            if (e.key === 'Escape') {
                highlightedSearchIndex = -1;
                searchDropdown?.classList.add('hidden');
            }
        });

        document.addEventListener('click', (e) => {
            const withinSearch = e.target.closest('.search-bar') || e.target.closest('#search-dropdown');
            if (!withinSearch) {
                highlightedSearchIndex = -1;
                UI.elements.searchDropdown().classList.add('hidden');
            }
        });
    }

    // Discover Search
    if (discoverSearchInput && discoverSearchBtn) {
        const performSearch = () => {
            const query = discoverSearchInput.value.trim();
            localStorage.setItem('genesis_discover_search', query);
            DiscoverManager.renderDiscoverGrid(query);
        };
        discoverSearchBtn.addEventListener('click', () => deferUserTask(performSearch));
        discoverSearchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') deferUserTask(performSearch); });
    }

    // Open Menu (File Input)
    const openMenuBtn = document.getElementById('open-menu-btn');
    const openMenuDropdown = document.getElementById('open-menu-dropdown');
    if (openMenuBtn && openMenuDropdown) {
        openMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openMenuDropdown.classList.toggle('hidden');
        });
        document.addEventListener('click', () => openMenuDropdown.classList.add('hidden'));
    }

    const fileInput = document.getElementById('file-input');
    const folderInput = document.getElementById('folder-input');
    if (fileInput) fileInput.addEventListener('change', (e) => deferUserTask(async () => {
        const activeSectionId = localStorage.getItem('genesis_active_section') || 'library-section';
        await importFilesForSection(e.target.files, activeSectionId);
        e.target.value = '';
    }));
    if (folderInput) folderInput.addEventListener('change', (e) => deferUserTask(async () => {
        const activeSectionId = localStorage.getItem('genesis_active_section') || 'library-section';
        await importFilesForSection(e.target.files, activeSectionId);
        e.target.value = '';
    }));

    document.getElementById('open-files-option')?.addEventListener('click', () => fileInput.click());
    document.getElementById('open-folder-option')?.addEventListener('click', () => folderInput.click());
    document.getElementById('queue-add-files-btn')?.addEventListener('click', () => fileInput?.click());

    // Drag and Drop
    document.addEventListener('dragenter', (e) => {
        if (!isFileDragEvent(e)) return;
        e.preventDefault();
        const targetSection = resolveDropTargetSection(e.target);
        clearDropTargets();
        document.body.classList.add('dragover');
        targetSection?.classList.add('file-drop-active');
    });
    document.addEventListener('dragover', (e) => {
        if (!isFileDragEvent(e)) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        const targetSection = resolveDropTargetSection(e.target);
        clearDropTargets();
        document.body.classList.add('dragover');
        targetSection?.classList.add('file-drop-active');
    });
    document.addEventListener('dragleave', (e) => {
        if (!isFileDragEvent(e)) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.relatedTarget) return;
        clearDropTargets();
    });
    document.addEventListener('drop', (e) => {
        if (!isFileDragEvent(e)) return;
        e.preventDefault();
        e.stopPropagation();
        const targetSection = resolveDropTargetSection(e.target);
        const droppedFiles = getDroppedFiles(e);
        clearDropTargets();
        if (droppedFiles.length > 0) {
            deferUserTask(() => importFilesForSection(droppedFiles, targetSection?.id || 'library-section'));
        }
    });

    // Modals
    // Message Modal Close
    const msgCloseBtn = document.getElementById('msg-close-btn');
    if (msgCloseBtn) {
        msgCloseBtn.addEventListener('click', () => {
            document.getElementById('message-modal').classList.add('hidden');
        });
    }

    // Global Modal Click-Away
    window.addEventListener('click', (event) => {
        if (event.target.classList.contains('modal')) {
            // Special handling for confirmation modal to resolve its promise
            if (event.target.id === 'confirm-modal') {
                document.getElementById('confirm-cancel-btn')?.click();
            } else {
                event.target.classList.add('hidden');
            }
        }
    });

    // Open URL modal handlers...
    const urlModal = document.getElementById('url-modal');
    const urlInput = document.getElementById('url-input');
    const urlCancelBtn = document.getElementById('url-cancel-btn');
    if (urlCancelBtn) urlCancelBtn.addEventListener('click', () => urlModal.classList.add('hidden'));

    const urlLoadBtn = document.getElementById('url-load-btn');
    if (urlLoadBtn && urlInput) {
        urlLoadBtn.addEventListener('click', () => {
            const url = urlInput.value.trim();
            if (url) {
                PlaybackManager.startPlayback([url]);
                urlModal.classList.add('hidden');
                urlInput.value = '';
            }
        });
    }

    // Section Action Buttons (Arrows -> Open full views)
    // Artists
    const artistsArrow = document.querySelector('#home-section .section-header-row:nth-of-type(2) .section-action-btn');
    if (artistsArrow) artistsArrow.addEventListener('click', () => LibraryManager.openSectionModal('artists'));

    // Albums
    const albumsArrow = document.querySelector('#home-section .section-header-row:nth-of-type(3) .section-action-btn');
    if (albumsArrow) albumsArrow.addEventListener('click', () => LibraryManager.openSectionModal('albums'));

    // Suggestion Cards Click
    const suggestionContainer = document.getElementById('home-suggestions-container');
    if (suggestionContainer) {
        suggestionContainer.addEventListener('click', async (e) => {
            const card = e.target.closest('.suggestion-card');
            if (!card) return;

            const mixType = card.dataset.mixType;
            if (mixType) {
                const mixData = await DiscoverManager.fetchMix(mixType);
                if (mixData && mixData.tracks.length > 0) {
                    PlaylistManager.openPlaylistView({
                        id: `mix-${mixType}`,
                        name: mixData.name,
                        description: 'Curated mix based on your taste',
                        tracks: mixData.tracks,
                        isVirtual: true,
                        coverURL: mixData.tracks[0]?.coverURL
                    });
                }
            } else if (card.id === 'suggestion-quick-shuffle') {
                PlaybackManager.toggleShuffle();
                if (playerContext.libraryTracks.length) {
                    PlaybackManager.startPlayback(playerContext.libraryTracks.map(t => t.id), 0, true);
                }
            }
        });
    }
    // Edit Modal handlers...
    // Profile Pic handlers...
    const profilePicInput = document.getElementById('profile-pic-input');
    if (profilePicInput) {
        profilePicInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function (eResult) {
                    const result = eResult.target.result;
                    localStorage.setItem('genesis_profile_pic', result);
                    ProfileManager.renderProfile();
                };
                reader.readAsDataURL(file);
            }
        });
    }
    const savedPic = localStorage.getItem('genesis_profile_pic');
    if (savedPic) {
        const profilePic = document.getElementById('profile-pic');
        if (profilePic) profilePic.src = savedPic;
    }

    // Global Keydown
    document.addEventListener('keydown', (event) => {
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
        switch (event.key) {
            case ' ': event.preventDefault(); playerContext.isPlaying ? PlaybackManager.pauseTrack() : PlaybackManager.playTrack(); break;
            case 'ArrowRight': event.preventDefault(); PlaybackManager.nextTrack(); break;
            case 'ArrowLeft': event.preventDefault(); PlaybackManager.prevTrack(); break;
            case 'ArrowUp':
                event.preventDefault();
                audioPlayer.volume = Math.min(1.0, audioPlayer.volume + 0.1);
                audioPlayer.muted = false;
                if (volumeSlider) volumeSlider.value = audioPlayer.volume;
                PlaybackManager.syncEnhancedVolume();
                PlaybackManager.savePlaybackState();
                updateVolumeUI();
                break;
            case 'ArrowDown':
                event.preventDefault();
                audioPlayer.volume = Math.max(0.0, audioPlayer.volume - 0.1);
                audioPlayer.muted = false;
                if (volumeSlider) volumeSlider.value = audioPlayer.volume;
                PlaybackManager.syncEnhancedVolume();
                PlaybackManager.savePlaybackState();
                updateVolumeUI();
                break;
            case 'm':
            case 'M':
                event.preventDefault();
                audioPlayer.muted = !audioPlayer.muted;
                PlaybackManager.syncEnhancedVolume();
                PlaybackManager.savePlaybackState();
                updateVolumeUI();
                break;
        }
    });

    // Playlist Creation Button
    const createPlaylistBtn = document.getElementById('create-playlist-btn');
    if (createPlaylistBtn) {
        createPlaylistBtn.addEventListener('click', async () => {
            const name = await UI.showInputModal('New Playlist', 'Enter playlist name:', '', 'My Favorites');
            if (name && name.trim()) PlaylistManager.createPlaylist(name.trim(), true);
        });
    }

    // Floating Shuffle Button Logic
    const shuffleFab = document.getElementById('library-shuffle-fab');
    if (shuffleFab) {
        shuffleFab.addEventListener('click', () => {
            const tracks = [...playerContext.libraryTracks];
            if (tracks.length > 0) {
                // Shuffle logic
                for (let i = tracks.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
                }
                const trackIds = tracks.map(t => t.id);
                PlaybackManager.startPlayback(trackIds, 0, false);
            }
        });
    }

    // Suggestion Cards Actions
    document.getElementById('suggestion-quick-shuffle')?.addEventListener('click', () => {
        const tracks = [...playerContext.libraryTracks];
        if (tracks.length > 0) {
            for (let i = tracks.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
            }
            PlaybackManager.startPlayback(tracks.map(t => t.id), 0, false);
        }
    });

    document.getElementById('suggestion-recent-queue')?.addEventListener('click', () => {
        UI.switchSection('queue-view-section');
    });

    // Playback Bar Swiping (Gestures)
    const playbackBar = document.querySelector('.playback-bar');
    if (playbackBar) {
        let touchStartX = 0;
        playbackBar.addEventListener('touchstart', e => {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        playbackBar.addEventListener('touchend', e => {
            const touchEndX = e.changedTouches[0].screenX;
            const threshold = 50;
            if (touchEndX < touchStartX - threshold) {
                PlaybackManager.nextTrack(); // Swipe left -> Next
            } else if (touchEndX > touchStartX + threshold) {
                PlaybackManager.prevTrack(); // Swipe right -> Prev
            }
        }, { passive: true });
    }

    // Extended Info Panel Toggles
    const closeExtendedPanelBtn = document.getElementById('close-extended-panel-btn');
    const playbackBarTrackInfo = document.getElementById('playback-bar-track-info');
    const mainContent = document.querySelector('.main-content');
    const extendedInfoPanel = document.getElementById('extended-info-panel');

    if (playbackBarTrackInfo && extendedInfoPanel && closeExtendedPanelBtn && mainContent) {
        playbackBarTrackInfo.addEventListener('click', () => {
            // Update first!
            // We need a way to render extended info from here. 
            // PlaybackManager.updatePlaybackBar should handle it if active.
            // We can call it manually.
            extendedInfoPanel.classList.add('active');
            mainContent.classList.add('panel-active');

            const track = playerContext.trackQueue[playerContext.currentTrackIndex];
            if (track) PlaybackManager.updatePlaybackBar(track); // Re-trigger update to fill panel
        });

        closeExtendedPanelBtn.addEventListener('click', () => {
            extendedInfoPanel.classList.remove('active');
            mainContent.classList.remove('panel-active');
        });

        // Lyrics Controls
        const refreshLyricsBtn = document.getElementById('lyrics-refresh-btn');
        const searchLyricsBtn = document.getElementById('lyrics-search-btn');
        if (refreshLyricsBtn) refreshLyricsBtn.addEventListener('click', refreshLyrics);
        if (searchLyricsBtn) searchLyricsBtn.addEventListener('click', openManualLyricsSearch);
    }

    // Library View Toggles
    const gridViewBtn = document.getElementById('library-grid-view-btn');
    const listViewBtn = document.getElementById('library-list-view-btn');
    if (gridViewBtn && listViewBtn) {
        gridViewBtn.addEventListener('click', () => {
            UI.switchLibraryView('grid');
            deferUserTask(() => LibraryManager.renderLibraryGrid());
        });
        listViewBtn.addEventListener('click', () => {
            UI.switchLibraryView('list');
            deferUserTask(() => LibraryManager.renderLibraryGrid());
        });
    }

    // Play All Library (Removed/Redirected)
    const playAllLibBtn = document.getElementById('library-play-all-btn');
    if (playAllLibBtn) {
        playAllLibBtn.addEventListener('click', () => {
            document.getElementById('library-shuffle-fab')?.click();
        });
    }

    // Global Context Menu Closer
    document.addEventListener('click', (event) => {
        // If clicking outside the open context menu
        // We need access to the open menu element. 
        // ContextMenuManager manages it, but we can't easily access the DOM element to check 'contains' unless exposed.
        // Or ContextMenuManager sets a global handler.
        // But we want to avoid too many globals.
        // We added window.setActiveContextMenu. 
        // We can just call ContextMenuManager.closeContextMenu() if the click target is not a context menu.
        // But how to check?
        const menu = document.querySelector('.context-menu.active');
        if (menu && !menu.contains(event.target) && !event.target.closest('.track-action-btn') && !event.target.closest('.playlist-action-btn')) {
            ContextMenuManager.closeContextMenu();
        }
    });

    // Make refreshLibraryViews global for simple inter-module refreshing
    window.refreshLibraryViews = () => {
        deferUserTask(() => {
            LibraryManager.renderHomeGrid();
            LibraryManager.renderLibraryGrid();
            AlbumManager.renderAlbumsGrid();
            ArtistManager.renderArtistsGrid();
        });
    };

    window.addEventListener('blur', clearDropTargets);

});
