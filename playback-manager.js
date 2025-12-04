let config = {
    audioPlayer: null,
    playerContext: null,
    playIcon: null,
    shuffleBtn: null,
    repeatBtn: null,
    playBtn: null,
    nextBtn: null,
    prevBtn: null,
    updatePlaybackBar: () => {},
    renderQueueTable: () => {}, // This will be called from script.js now
    savePlaybackState: () => {},
    onTimeUpdate: () => {},
};

let repeatState = 0; // 0: no-repeat, 1: repeat-all, 2: repeat-one
let isShuffled = false;
export function init(dependencies) {
    config = { ...config, ...dependencies };
    repeatState = config.playerContext.repeatState || 0;

    // Attach event listeners
    config.playBtn.addEventListener('click', togglePlayPause);
    config.nextBtn.addEventListener('click', nextTrack);
    config.prevBtn.addEventListener('click', prevTrack);
    config.shuffleBtn.addEventListener('click', toggleShuffle);
    config.repeatBtn.addEventListener('click', toggleRepeat);

    config.audioPlayer.addEventListener('timeupdate', config.onTimeUpdate);
    config.audioPlayer.addEventListener('ended', nextTrack);
    config.audioPlayer.addEventListener('error', handlePlaybackError);
}

function playTrack() {
    if (!config.audioPlayer.src) return;
    config.audioPlayer.play()
        .then(() => {
            config.playerContext.isPlaying = true;
            config.playIcon.className = 'fas fa-pause';
            document.querySelector('.playback-bar')?.classList.add('playing');
        })
        .catch(handlePlaybackError);
}

export function pauseTrack() {
    config.audioPlayer.pause();
    config.playerContext.isPlaying = false;
    config.playIcon.className = 'fas fa-play';
    document.querySelector('.playback-bar')?.classList.remove('playing');
}

export function togglePlayPause() {
    if (config.playerContext.isPlaying) {
        pauseTrack();
    } else {
        // If there's a track loaded but paused, play it.
        if (config.playerContext.currentTrackIndex > -1) {
            playTrack();
        }
    }
}

export function loadTrack(index, autoPlay = true) {
    config.playerContext.currentTrackIndex = index;
    const track = config.playerContext.trackQueue[index];
    
    config.audioPlayer.src = track.objectURL;
    config.updatePlaybackBar(track);

    // The queue is rendered by the caller (e.g., script.js) to ensure correct timing
    config.savePlaybackState();
    if (autoPlay) {
        playTrack();
    }
}

export function startPlayback(trackIds, startIndex = 0, shuffle = false) {
    if (!trackIds || trackIds.length === 0) return;
    
    let newQueue = trackIds.map(id => config.playerContext.libraryTracks.find(t => t.id === id)).filter(Boolean);

    if (newQueue.length === 0) {
        return;
    }

    if (shuffle) {
        // Fisher-Yates shuffle algorithm
        for (let i = newQueue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newQueue[i], newQueue[j]] = [newQueue[j], newQueue[i]];
        }
        startIndex = 0; // Always start from the beginning of a shuffled queue
    }

    config.playerContext.trackQueue = newQueue;
    loadTrack(startIndex, true);
    config.renderQueueTable(); // Render the new queue
}

function nextTrack() {
    const { trackQueue, currentTrackIndex, isShuffled } = config.playerContext;
    if (!trackQueue || trackQueue.length === 0) return;
    
    if (repeatState === 2) { // Repeat One
        if (currentTrackIndex !== -1) {
            config.audioPlayer.currentTime = 0;
            playTrack();
        }
        return;
    }

    let nextIndex = isShuffled 
        ? Math.floor(Math.random() * trackQueue.length) 
        : currentTrackIndex + 1;

    if (nextIndex >= trackQueue.length) { // End of queue
        if (repeatState === 1) { // Repeat All
            nextIndex = 0;
        } else { // No repeat
            pauseTrack();
            config.audioPlayer.currentTime = 0;
            return;
        }
    }
    
    if (trackQueue[nextIndex]?.objectURL) {
        loadTrack(nextIndex);
    }
}

function prevTrack() {
    if (!config.playerContext.trackQueue || config.playerContext.trackQueue.length === 0) return;
    if (config.audioPlayer.currentTime > 3) {
        config.audioPlayer.currentTime = 0;
        return;
    }
    const prevIndex = (config.playerContext.currentTrackIndex - 1 + config.playerContext.trackQueue.length) % config.playerContext.trackQueue.length;
    if (config.playerContext.trackQueue[prevIndex]?.objectURL) loadTrack(prevIndex);
}

function handlePlaybackError(e) {
    console.error("Audio playback error:", e);
    const track = config.playerContext.trackQueue[config.playerContext.currentTrackIndex];
    if (track) {
        config.showMessage(`Error playing "${track.name}". The file may be corrupt or unsupported.`);
    }
    pauseTrack();
}

function toggleShuffle() {
    config.playerContext.isShuffled = !config.playerContext.isShuffled;
    setShuffleState(config.playerContext.isShuffled);
    config.savePlaybackState();
}

function toggleRepeat() {
    repeatState = (repeatState + 1) % 3;
    config.playerContext.repeatState = repeatState;
    updateRepeatButtonUI();
    config.savePlaybackState();
}

export function updateRepeatButtonUI() {
    config.repeatBtn.classList.remove('repeat-one');
    config.repeatBtn.style.color = 'var(--text-color)';
    let title = "Repeat Off";

    if (repeatState === 1) { // Repeat All
        config.repeatBtn.style.color = 'var(--primary-color)';
        title = "Repeat All";
    } else if (repeatState === 2) { // Repeat One
        config.repeatBtn.style.color = 'var(--primary-color)';
        config.repeatBtn.classList.add('repeat-one');
        title = "Repeat One";
    }
    config.repeatBtn.title = title;
}

export function getRepeatState() {
    return repeatState;
}

export function setRepeatState(state) {
    const validState = parseInt(state, 10);
    if (!isNaN(validState) && validState >= 0 && validState <= 2) {
        repeatState = validState;
        updateRepeatButtonUI();
    }
}

export function setShuffleState(shuffle) {
    config.playerContext.isShuffled = shuffle;
    if (config.shuffleBtn) {
        config.shuffleBtn.style.color = config.playerContext.isShuffled ? 'var(--primary-color)' : 'var(--text-color)';
    }
}