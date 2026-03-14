import { playerContext } from './state.js';
import { showInputModal } from './ui-manager.js';

export async function fetchLyricsForTrack(track, skipIds = [], manualMetadata = null) {
    if (!track) return;

    track.isLyricsFetching = true;
    if (!track.skippedLyricsIds) track.skippedLyricsIds = [];
    if (skipIds.length > 0) {
        track.skippedLyricsIds.push(...skipIds);
    }

    renderLyrics(track); // Show loading state

    try {
        const langCode = 'en';
        const title = manualMetadata ? manualMetadata.title : track.title;
        const artist = manualMetadata ? manualMetadata.artist : track.artist;
        const album = manualMetadata ? manualMetadata.album : track.album;
        const year = manualMetadata ? manualMetadata.year : track.year;

        let url = `/api/lyrics?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}&album=${encodeURIComponent(album || '')}&year=${encodeURIComponent(year || '')}&lang=${langCode}`;

        if (track.skippedLyricsIds.length > 0) {
            track.skippedLyricsIds.forEach(id => {
                url += `&skipIds=${id}`;
            });
        }

        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            if (data.lyrics) {
                track.lyrics = data.lyrics;
                track.currentLyricsId = data.id;
            } else {
                track.lyrics = "No lyrics found.";
                track.currentLyricsId = null;
            }
        } else {
            track.lyrics = "No lyrics found.";
            track.currentLyricsId = null;
        }
    } catch (e) {
        console.error("Lyrics fetch failed", e);
        track.lyrics = "No lyrics found.";
    } finally {
        track.isLyricsFetching = false;

        // Only update UI if this track is still the current one
        const currentTrack = playerContext.trackQueue[playerContext.currentTrackIndex];
        if (currentTrack && currentTrack.id === track.id) {
            renderLyrics(track);
        }
    }
}

export function refreshLyrics() {
    const track = playerContext.trackQueue[playerContext.currentTrackIndex];
    if (!track || track.isLyricsFetching) return;

    const currentId = track.currentLyricsId;
    fetchLyricsForTrack(track, currentId ? [currentId] : []);
}

export async function openManualLyricsSearch() {
    const track = playerContext.trackQueue[playerContext.currentTrackIndex];
    if (!track) return;

    const title = await showInputModal("Manual Search", "Song Title:", track.title);
    if (!title) return;
    const artist = await showInputModal("Manual Search", "Artist:", track.artist);
    if (!artist) return;
    const album = await showInputModal("Manual Search", "Album (Optional):", track.album || "");
    const year = await showInputModal("Manual Search", "Year (Optional):", track.year || "");

    track.skippedLyricsIds = []; // Clear skips for new manual search
    fetchLyricsForTrack(track, [], { title, artist, album, year });
}

export function renderLyrics(track) {
    const lyricsContainer = document.getElementById('lyrics-container');
    if (!lyricsContainer) return;

    // Reset cache when rendering new lyrics
    cachedLyricLines = null;

    if (track.syncedLyrics && track.syncedLyrics.length > 0) {
        const fragment = document.createDocumentFragment();
        track.syncedLyrics.forEach((line, index) => {
            const p = document.createElement('p');
            p.className = 'lyric-line';
            p.dataset.index = index;
            p.innerHTML = line.text || '&nbsp;';
            fragment.appendChild(p);
        });
        lyricsContainer.innerHTML = '';
        lyricsContainer.appendChild(fragment);
    } else if (track.lyrics) {
        lyricsContainer.innerHTML = track.lyrics.replace(/\n/g, '<br>');
        // Robust scroll reset
        setTimeout(() => lyricsContainer.scrollTo({ top: 0, behavior: 'instant' }), 100);
    } else if (track.isLyricsFetching) {
        lyricsContainer.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading Lyrics...</div>';
        setTimeout(() => lyricsContainer.scrollTo({ top: 0, behavior: 'instant' }), 100);
    } else {
        lyricsContainer.innerHTML = '<p class="lyric-line" style="font-style: italic;">No lyrics found for this track.</p>';
        setTimeout(() => lyricsContainer.scrollTo({ top: 0, behavior: 'instant' }), 100);
    }
}

let currentLyricIndex = -1;
let cachedLyricLines = null;

export function syncLyrics(currentTime) {
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
        if (!cachedLyricLines) {
            cachedLyricLines = document.querySelectorAll('#lyrics-container .lyric-line');
        }

        if (cachedLyricLines.length === 0) return;

        // If it's a sequential move, we can optimize by only updating two lines
        if (newLyricIndex === currentLyricIndex + 1 && currentLyricIndex >= -1) {
            if (currentLyricIndex >= 0 && cachedLyricLines[currentLyricIndex]) {
                cachedLyricLines[currentLyricIndex].classList.replace('active', 'past');
            }
            if (cachedLyricLines[newLyricIndex]) {
                cachedLyricLines[newLyricIndex].classList.remove('upcoming');
                cachedLyricLines[newLyricIndex].classList.add('active');
                cachedLyricLines[newLyricIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        } else {
            // Full sync for seeks or jumps
            cachedLyricLines.forEach((line, index) => {
                line.classList.remove('active', 'past', 'upcoming');
                if (index === newLyricIndex) {
                    line.classList.add('active');
                    line.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } else if (index < newLyricIndex) {
                    line.classList.add('past');
                } else {
                    line.classList.add('upcoming');
                }
            });
        }
        currentLyricIndex = newLyricIndex;
    }
}

export function resetLyricsState() {
    currentLyricIndex = -1;
}
