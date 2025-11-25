document.addEventListener('DOMContentLoaded', function() {
    // --- State ---
    const LOCAL_STORAGE_KEY = 'genesis_offline_playlist';
    const DB_NAME = 'GenesisAudioDB';
    const DB_STORE = 'audioFiles';
    
    let trackQueue = [];
    let currentTrackIndex = -1;
    let isPlaying = false;
    let isShuffled = false;
    let isRepeated = false;
    let dbInstance = null;

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
    
    const volumeSlider = document.getElementById('volume-slider');
    const songTitle = document.getElementById('song-title');
    const artistName = document.getElementById('artist-name');
    const queueList = document.getElementById('queue-list');
    
    // Menu & Input Elements
    const openMenuBtn = document.getElementById('open-menu-btn');
    const openMenuDropdown = document.getElementById('open-menu-dropdown');
    const openFilesOption = document.getElementById('open-files-option');
    const openFolderOption = document.getElementById('open-folder-option');
    const openUrlOption = document.getElementById('open-url-option');
    const fileInput = document.getElementById('file-input');
    const folderInput = document.getElementById('folder-input');
    const searchInput = document.getElementById('search-input');

    // Modals
    const urlModal = document.getElementById('url-modal');
    const urlInput = document.getElementById('url-input');
    const urlLoadBtn = document.getElementById('url-load-btn');
    const urlCancelBtn = document.getElementById('url-cancel-btn');
    
    const msgModal = document.getElementById('message-modal');
    const msgText = document.getElementById('modal-text');
    const msgCloseBtn = document.getElementById('msg-close-btn');

    // --- IndexedDB Helpers (For Persistent Audio) ---
    function initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(DB_STORE)) {
                    db.createObjectStore(DB_STORE);
                }
            };

            request.onsuccess = (event) => {
                dbInstance = event.target.result;
                resolve(dbInstance);
            };

            request.onerror = (event) => {
                console.error("IndexedDB error:", event.target.error);
                reject(event.target.error);
            };
        });
    }

    function saveFileToDB(id, fileBlob) {
        return new Promise((resolve, reject) => {
            if (!dbInstance) return reject("DB not initialized");
            const transaction = dbInstance.transaction([DB_STORE], "readwrite");
            const store = transaction.objectStore(DB_STORE);
            const request = store.put(fileBlob, id);
            
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e.target.error);
        });
    }

    function getFileFromDB(id) {
        return new Promise((resolve, reject) => {
            if (!dbInstance) return resolve(null); // Fail gracefully
            const transaction = dbInstance.transaction([DB_STORE], "readonly");
            const store = transaction.objectStore(DB_STORE);
            const request = store.get(id);
            
            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (e) => {
                console.warn("Error fetching file from DB", e);
                resolve(null);
            };
        });
    }

    // --- Helpers ---
    function showMessage(msg) {
        msgText.textContent = msg;
        msgModal.classList.remove('hidden');
    }
    
    function formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return "0:00";
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
    }

    function savePlaylistMetadata() {
        // Only save metadata to localStorage
        const meta = trackQueue.map(t => ({
            id: t.id,
            name: t.name,
            duration: t.duration,
            isURL: t.isURL,
            url: t.isURL ? t.objectURL : null 
        }));
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(meta));
    }

    async function restoreSession() {
        await initDB(); // Ensure DB is ready first

        try {
            const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (stored) {
                const metaQueue = JSON.parse(stored);
                
                // Rehydrate queue: try to fetch blobs from IndexedDB for local files
                const restorationPromises = metaQueue.map(async (t) => {
                    let objectURL = null;
                    
                    if (t.isURL) {
                        objectURL = t.url;
                    } else {
                        // Try fetching the file blob from IndexedDB
                        const blob = await getFileFromDB(t.id);
                        if (blob) {
                            objectURL = URL.createObjectURL(blob);
                        }
                    }

                    return {
                        ...t,
                        objectURL: objectURL
                    };
                });

                trackQueue = await Promise.all(restorationPromises);
                renderQueue();
                
                // Load first track if available (but don't auto-play)
                if (trackQueue.length > 0 && trackQueue[0].objectURL) {
                    loadTrack(0, false); // false = don't auto play on restore
                }
            }
        } catch (e) {
            console.error("Error restoring session", e);
        }
    }

    // --- Player Core ---
    function renderQueue() {
        queueList.innerHTML = '';
        const query = searchInput.value.toLowerCase();
        
        const filtered = trackQueue.filter(t => t.name.toLowerCase().includes(query));

        if (filtered.length === 0) {
            queueList.innerHTML = `<div style="padding:20px; text-align:center; color:#999;">${trackQueue.length === 0 ? 'Library is empty.' : 'No matches found.'}</div>`;
            return;
        }

        filtered.forEach((track) => {
            const index = trackQueue.findIndex(t => t.id === track.id);
            const isActive = index === currentTrackIndex;
            const isReady = !!track.objectURL;

            const div = document.createElement('div');
            div.className = `queue-item ${isActive ? 'active' : ''}`;
            
            let iconClass = track.isURL ? 'fa-globe' : 'fa-music';
            let statusHtml = isReady 
                ? '<span class="queue-item-status status-ready">Ready</span>' 
                : '<span class="queue-item-status status-meta">Missing</span>';

            div.innerHTML = `
                <div class="queue-item-icon">
                    <i class="fas ${iconClass}"></i>
                </div>
                <div class="queue-item-info">
                    <h4>${track.name}</h4>
                    <p>${track.isURL ? 'Stream' : 'Local File'}</p>
                </div>
                <div style="text-align:right;">
                    <div class="queue-item-duration">${formatTime(track.duration)}</div>
                    ${statusHtml}
                </div>
            `;

            div.addEventListener('click', () => {
                if (isReady) {
                    loadTrack(index);
                } else {
                    showMessage(`File "${track.name}" is missing from storage. Please re-open it.`);
                }
            });

            queueList.appendChild(div);
        });
    }

    function loadTrack(index, autoPlay = true) {
        currentTrackIndex = index;
        const track = trackQueue[index];
        
        audioPlayer.src = track.objectURL;
        songTitle.textContent = track.name;
        artistName.textContent = track.isURL ? 'Web Stream' : 'Local Audio';
        
        renderQueue();
        
        if (autoPlay) {
            playTrack();
        }
    }

    function playTrack() {
        audioPlayer.play()
            .then(() => {
                isPlaying = true;
                playIcon.className = 'fas fa-pause';
                document.querySelector('.player-container').classList.add('playing');
            })
            .catch(e => {
                console.error(e);
                isPlaying = false;
                playIcon.className = 'fas fa-play';
            });
    }

    function pauseTrack() {
        audioPlayer.pause();
        isPlaying = false;
        playIcon.className = 'fas fa-play';
        document.querySelector('.player-container').classList.remove('playing');
    }

    function nextTrack() {
        if (trackQueue.length === 0) return;
        
        let nextIndex;
        if (isShuffled) {
            nextIndex = Math.floor(Math.random() * trackQueue.length);
        } else {
            nextIndex = currentTrackIndex + 1;
            if (nextIndex >= trackQueue.length) {
                if (isRepeated) nextIndex = 0;
                else return; 
            }
        }
        
        if (trackQueue[nextIndex].objectURL) {
            loadTrack(nextIndex);
        } else {
            currentTrackIndex = nextIndex; 
            nextTrack(); 
        }
    }

    function prevTrack() {
        if (trackQueue.length === 0) return;
        let prevIndex = currentTrackIndex - 1;
        if (prevIndex < 0) prevIndex = trackQueue.length - 1;
        
        if (trackQueue[prevIndex].objectURL) {
            loadTrack(prevIndex);
        }
    }

    // --- File Processing ---
    function processFile(file) {
        if (!file.type.startsWith('audio/')) return Promise.resolve(null);
        
        return new Promise((resolve) => {
            const url = URL.createObjectURL(file);
            const audio = new Audio();
            audio.src = url;
            
            const name = file.name.replace(/\.[^/.]+$/, ""); 
            const id = Date.now() + Math.random().toString();

            audio.onloadedmetadata = async () => {
                // Save the file blob to IndexedDB for persistence
                try {
                    await saveFileToDB(id, file);
                } catch (e) {
                    console.warn("Quota exceeded or error saving to DB", e);
                }

                resolve({
                    id,
                    name,
                    duration: audio.duration,
                    isURL: false,
                    objectURL: url
                });
            };
            
            audio.onerror = () => resolve(null);
            setTimeout(() => resolve(null), 3000);
        });
    }

    async function handleFiles(fileList) {
        if (!fileList.length) return;
        
        showMessage(`Processing and saving ${fileList.length} files...`);
        
        // We ensure DB is initialized before processing
        if (!dbInstance) await initDB();

        const promises = Array.from(fileList).map(processFile);
        const newTracks = (await Promise.all(promises)).filter(t => t !== null);
        
        if (newTracks.length > 0) {
            trackQueue.push(...newTracks);
            savePlaylistMetadata(); // Update localStorage order
            renderQueue();
            showMessage(`Saved ${newTracks.length} tracks to library.`);
            
            if (currentTrackIndex === -1) {
                loadTrack(trackQueue.length - newTracks.length);
            }
        } else {
            showMessage("No valid audio files found.");
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

    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
    folderInput.addEventListener('change', (e) => handleFiles(e.target.files));

    urlCancelBtn.addEventListener('click', () => urlModal.classList.add('hidden'));
    urlLoadBtn.addEventListener('click', () => {
        const url = urlInput.value.trim();
        if (!url) return;
        
        const track = {
            id: Date.now().toString(),
            name: url.split('/').pop() || "Stream",
            duration: 0, 
            isURL: true,
            objectURL: url
        };
        
        trackQueue.push(track);
        savePlaylistMetadata();
        renderQueue();
        urlModal.classList.add('hidden');
        
        if (currentTrackIndex === -1) loadTrack(trackQueue.length - 1);
    });

    msgCloseBtn.addEventListener('click', () => msgModal.classList.add('hidden'));

    playBtn.addEventListener('click', () => isPlaying ? pauseTrack() : playTrack());
    nextBtn.addEventListener('click', nextTrack);
    prevBtn.addEventListener('click', prevTrack);
    
    shuffleBtn.addEventListener('click', () => {
        isShuffled = !isShuffled;
        shuffleBtn.style.color = isShuffled ? 'var(--primary-color)' : 'var(--dark-color)';
    });
    
    repeatBtn.addEventListener('click', () => {
        isRepeated = !isRepeated;
        repeatBtn.style.color = isRepeated ? 'var(--primary-color)' : 'var(--dark-color)';
    });

    audioPlayer.addEventListener('timeupdate', () => {
        const { currentTime, duration } = audioPlayer;
        if (isNaN(duration)) return;
        
        const pct = (currentTime / duration) * 100;
        progressFill.style.width = `${pct}%`;
        currentTimeEl.textContent = formatTime(currentTime);
        durationEl.textContent = formatTime(duration);
    });
    
    audioPlayer.addEventListener('ended', nextTrack);
    
    progressBarContainer.addEventListener('click', (e) => {
        if (!audioPlayer.duration) return;
        const rect = progressBarContainer.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        audioPlayer.currentTime = pos * audioPlayer.duration;
    });

    volumeSlider.addEventListener('input', (e) => {
        audioPlayer.volume = e.target.value;
    });

    searchInput.addEventListener('input', renderQueue);

    // --- Start ---
    restoreSession();
});