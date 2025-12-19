import { playerContext } from './state.js';
import { formatTime } from './utils.js';
import { renderQueueTable } from './queue-manager.js';
import { showMessage, elements } from './ui-manager.js';
import { fetchLyricsForTrack, renderLyrics, syncLyrics, resetLyricsState } from './lyrics-manager.js';

const PLAYBACK_STATE_KEY = 'genesis_playback_state';
let isDragging = false;

// Helpers to access DOM elements dynamically or cached
function getAudioPlayer() { return document.getElementById('audio-player'); }
function getProgressFill() { return document.getElementById('progress-fill'); }
function getProgressHead() { return document.getElementById('progress-head'); }
function getCurrentTimeEl() { return document.getElementById('current-time'); }
function getDurationEl() { return document.getElementById('duration'); }
function getVolumeSlider() { return document.getElementById('volume-slider'); }
// ... (keep getters)
function getVolumePercentage() { return document.getElementById('volume-percentage'); }
function getVolumeIcon() { return document.getElementById('volume-icon'); }
function getMuteBtn() { return document.getElementById('mute-btn'); }
function getPlayIcon() { return document.getElementById('play-icon'); }
function getShuffleBtn() { return document.getElementById('shuffle-btn'); }
function getRepeatBtn() { return document.getElementById('repeat-btn'); }
function getSongTitle() { return document.getElementById('song-title'); }
function getArtistName() { return document.getElementById('artist-name'); }
function getAlbumArtImg() { return document.getElementById('album-art-img'); }
function getAlbumArtPlaceholder() { return document.getElementById('album-art-placeholder'); }

export async function restorePlaybackState() {
    // Default play queue to the full library if no state
    if (playerContext.libraryTracks.length > 0) {
        playerContext.trackQueue = [...playerContext.libraryTracks];

        const savedState = localStorage.getItem(PLAYBACK_STATE_KEY);
        if (savedState) {
            try {
                const { trackId, currentTime, volume, isShuffled: savedShuffle, repeatState: savedRepeat } = JSON.parse(savedState);
                const restoredIndex = playerContext.trackQueue.findIndex(t => t.id === trackId);

                const audioPlayer = getAudioPlayer();
                const volumeSlider = getVolumeSlider();

                if (restoredIndex > -1) {
                    playerContext.currentTrackIndex = restoredIndex;
                    const track = playerContext.trackQueue[restoredIndex];
                    if (audioPlayer) {
                        audioPlayer.src = track.objectURL;
                        audioPlayer.volume = volume !== undefined ? volume : 1;
                        // Wait for metadata
                        const onMetadata = () => {
                            audioPlayer.currentTime = currentTime;
                            updateProgressBarUI(currentTime, audioPlayer.duration);
                            audioPlayer.removeEventListener('loadedmetadata', onMetadata);
                        };
                        audioPlayer.addEventListener('loadedmetadata', onMetadata);
                    }

                    if (volumeSlider) volumeSlider.value = audioPlayer.volume;

                    playerContext.isShuffled = savedShuffle;
                    setShuffleState(playerContext.isShuffled);
                    setRepeatState(savedRepeat);
                    updateRepeatButtonUI();

                    updatePlaybackBar(track);
                    renderQueueTable();
                } else {
                    // ID not found, play first
                    updatePlaybackBar(playerContext.libraryTracks[0]);
                }
            } catch (e) {
                console.error("Error parsing saved playback state", e);
                updatePlaybackBar(playerContext.libraryTracks[0]);
            }
        } else {
            updatePlaybackBar(playerContext.libraryTracks[0]);
        }
    }
}

export function savePlaybackState() {
    const audioPlayer = getAudioPlayer();
    if (playerContext.currentTrackIndex < 0 || !playerContext.trackQueue[playerContext.currentTrackIndex]) {
        localStorage.removeItem(PLAYBACK_STATE_KEY);
        return;
    }
    const state = {
        trackId: playerContext.trackQueue[playerContext.currentTrackIndex].id,
        currentTime: audioPlayer.currentTime,
        volume: audioPlayer.volume,
        isShuffled: playerContext.isShuffled,
        repeatState: playerContext.repeatState,
    };
    localStorage.setItem(PLAYBACK_STATE_KEY, JSON.stringify(state));
}

export function updatePlaybackBar(track) {
    const songTitle = getSongTitle();
    const artistName = getArtistName();
    const artImg = getAlbumArtImg();
    const placeholder = getAlbumArtPlaceholder();
    const extendedInfoPanel = elements.extendedInfoPanel();

    if (!track) {
        if (songTitle) songTitle.textContent = "No Track Selected";
        if (artistName) artistName.textContent = "Load files to begin";
        if (artImg) { artImg.src = ''; artImg.classList.add('hidden'); }
        if (placeholder) placeholder.classList.remove('hidden');
        return;
    }

    if (songTitle) songTitle.textContent = track.title || 'Unknown Title';
    if (artistName) artistName.textContent = track.artist || (track.isURL ? 'Web Stream' : 'Unknown Artist');

    if (track.coverURL) {
        if (artImg) { artImg.src = track.coverURL; artImg.classList.remove('hidden'); }
        if (placeholder) placeholder.classList.add('hidden');
    } else {
        if (artImg) { artImg.src = ''; artImg.classList.add('hidden'); }
        if (placeholder) placeholder.classList.remove('hidden');
    }

    if (extendedInfoPanel && extendedInfoPanel.classList.contains('active')) {
        updateExtendedInfoPanel(track);
    }
}

function updateExtendedInfoPanel(track) {
    if (!track) return;
    const extendedInfoArt = document.getElementById('extended-info-art');
    const extendedInfoTitle = document.getElementById('extended-info-title');
    const extendedInfoArtist = document.getElementById('extended-info-artist');

    if (extendedInfoArt) {
        extendedInfoArt.innerHTML = track.coverURL
            ? `<img src="${track.coverURL}" alt="Album Art">`
            : `<div class="placeholder-icon"><i class="fas fa-music"></i></div>`;
    }
    if (extendedInfoTitle) extendedInfoTitle.textContent = track.title || 'Unknown Title';
    if (extendedInfoArtist) extendedInfoArtist.textContent = track.artist || 'Unknown Artist';

    // Delegate lyrics rendering to lyrics-manager
    renderLyrics(track);
}

export function updateProgressBarUI(currentTime, duration) {
    if (isNaN(duration) || duration <= 0) return;
    const pct = (currentTime / duration) * 100;
    const fill = getProgressFill();
    const head = getProgressHead();
    const currEl = getCurrentTimeEl();
    const durEl = getDurationEl();

    if (fill) fill.style.width = `${pct}%`;
    if (head) head.style.left = `${pct}%`;
    if (currEl) currEl.textContent = formatTime(currentTime);
    if (durEl) durEl.textContent = formatTime(duration);
}

export function getTimeHandler() {
    return () => {
        const audioPlayer = getAudioPlayer();
        const { currentTime, duration } = audioPlayer;
        if (!isNaN(duration)) {
            updateProgressBarUI(currentTime, duration);
            savePlaybackState();
            syncLyrics(currentTime); // Delegate sync logic
        }
    };
}

export function loadTrack(index, autoPlay = true) {
    const audioPlayer = getAudioPlayer();
    playerContext.currentTrackIndex = index;
    const track = playerContext.trackQueue[index];

    if (track) audioPlayer.src = track.objectURL;
    updatePlaybackBar(track);

    renderQueueTable();
    savePlaybackState();

    // Reset lyrics state on track change
    resetLyricsState();

    if (autoPlay) {
        const canPlayHandler = () => {
            playTrack();
            audioPlayer.removeEventListener('canplay', canPlayHandler);
        };
        audioPlayer.addEventListener('canplay', canPlayHandler);
    }

    // Fetch lyrics if missing
    if (!track.lyrics && !track.syncedLyrics && !track.isLyricsFetching) {
        fetchLyricsForTrack(track);
    }
}

export function playTrack() {
    const audioPlayer = getAudioPlayer();
    const playIcon = getPlayIcon();
    if (!audioPlayer.src) return;

    playerContext.isPlaying = true;
    audioPlayer.play().then(() => {
        if (playIcon) playIcon.className = 'fas fa-pause';
        document.querySelector('.playback-bar')?.classList.add('playing');
    }).catch(e => {
        console.error("Playback failed:", e);
        pauseTrack();
    });
}

export function pauseTrack() {
    const audioPlayer = getAudioPlayer();
    const playIcon = getPlayIcon();
    audioPlayer.pause();
    playerContext.isPlaying = false;
    if (playIcon) playIcon.className = 'fas fa-play';
    document.querySelector('.playback-bar')?.classList.remove('playing');
}

export function startPlayback(tracksOrIds, startIndex = 0, shuffle = false) {
    if (!tracksOrIds || tracksOrIds.length === 0) return;

    let newQueue = tracksOrIds.map(item => {
        if (typeof item === 'string') {
            return playerContext.libraryTracks.find(t => t.id === item) || playerContext.discoverTracks.find(t => t.id === item);
        }
        return item;
    }).filter(Boolean);

    const discoverTracksInQueue = newQueue.filter(t => t.isFromDiscover);
    playerContext.trackQueue.unshift(...discoverTracksInQueue.filter(dt => !playerContext.trackQueue.some(qt => qt.id === dt.id)));

    if (newQueue.length === 0) {
        showMessage("Could not load the selected track for playback.");
        return;
    }

    if (shuffle) {
        for (let i = newQueue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newQueue[i], newQueue[j]] = [newQueue[j], newQueue[i]];
        }
        startIndex = 0;
    }

    playerContext.trackQueue = newQueue;
    loadTrack(startIndex);
}

export function nextTrack() {
    if (!playerContext.trackQueue || playerContext.trackQueue.length === 0) return;
    let nextIndex = playerContext.isShuffled
        ? Math.floor(Math.random() * playerContext.trackQueue.length)
        : playerContext.currentTrackIndex + 1;

    if (playerContext.repeatState === 2) {
        if (playerContext.currentTrackIndex !== -1) loadTrack(playerContext.currentTrackIndex, true);
        return;
    }

    if (nextIndex >= playerContext.trackQueue.length) {
        if (playerContext.repeatState === 1) {
            nextIndex = 0;
        } else {
            pauseTrack();
            return;
        }
    }

    if (playerContext.trackQueue[nextIndex]?.objectURL) {
        loadTrack(nextIndex);
    }
}

export function prevTrack() {
    if (!playerContext.trackQueue || playerContext.trackQueue.length === 0) return;
    const audioPlayer = getAudioPlayer();
    if (audioPlayer.currentTime > 3) {
        audioPlayer.currentTime = 0;
        return;
    }
    const prevIndex = (playerContext.currentTrackIndex - 1 + playerContext.trackQueue.length) % playerContext.trackQueue.length;
    if (playerContext.trackQueue[prevIndex]?.objectURL) loadTrack(prevIndex);
}

export function toggleShuffle() {
    playerContext.isShuffled = !playerContext.isShuffled;
    setShuffleState(playerContext.isShuffled);
    savePlaybackState();
}

export function setShuffleState(shuffle) {
    playerContext.isShuffled = shuffle;
    const shuffleBtn = getShuffleBtn();
    if (shuffleBtn) {
        shuffleBtn.style.color = playerContext.isShuffled ? 'var(--primary-color)' : 'var(--text-color)';
        shuffleBtn.title = playerContext.isShuffled ? "Shuffle On" : "Shuffle Off";
    }
}

export function toggleRepeat() {
    playerContext.repeatState = (playerContext.repeatState + 1) % 3;
    updateRepeatButtonUI();
    savePlaybackState();
}

export function setRepeatState(state) {
    playerContext.repeatState = state;
}

export function updateRepeatButtonUI() {
    const repeatBtn = getRepeatBtn();
    if (!repeatBtn) return;

    repeatBtn.classList.remove('repeat-one');
    repeatBtn.style.color = 'var(--text-color)';
    let title = "Repeat Off";

    if (playerContext.repeatState === 1) {
        repeatBtn.style.color = 'var(--primary-color)';
        title = "Repeat All";
    } else if (playerContext.repeatState === 2) {
        repeatBtn.style.color = 'var(--primary-color)';
        repeatBtn.classList.add('repeat-one');
        title = "Repeat One";
    }
    repeatBtn.title = title;
}

export function removeFromQueue(index) {
    playerContext.trackQueue.splice(index, 1);
    // Adjust current index if necessary
    if (index < playerContext.currentTrackIndex) {
        playerContext.currentTrackIndex--;
    } else if (index === playerContext.currentTrackIndex) {
        if (playerContext.trackQueue.length > 0) {
            let newIndex = index;
            if (newIndex >= playerContext.trackQueue.length) newIndex = 0;
            loadTrack(newIndex, true); // Immediately play next
        } else {
            pauseTrack(); // Stop playback
            playerContext.currentTrackIndex = -1;
            updatePlaybackBar(null);
        }
    }
    renderQueueTable();
}

// Drag seeking logic
export function initProgressBarListeners() {
    const progressBarContainer = document.getElementById('progress-container');
    const audioPlayer = getAudioPlayer();
    if (!progressBarContainer || !audioPlayer) return;

    const seek = (e) => {
        if (!audioPlayer.duration) return;
        const rect = progressBarContainer.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        let position = (clientX - rect.left) / rect.width;
        position = Math.max(0, Math.min(1, position));

        audioPlayer.currentTime = position * audioPlayer.duration;
        const pct = position * 100;
        const progressFill = getProgressFill();
        const progressHead = getProgressHead();
        const currentTimeEl = getCurrentTimeEl();

        if (progressFill) progressFill.style.width = `${pct}%`;
        if (progressHead) progressHead.style.left = `${pct}%`;
        if (currentTimeEl) currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
    };

    progressBarContainer.addEventListener('mousedown', (e) => {
        isDragging = true;
        seek(e);
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            seek(e);
        }
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });

    // ... touch events ...
}
