import { playerContext } from './state.js';

let startPlaybackFn = null;
let currentSource = 'jamendo';

export function setDiscoverDependencies(startPlayback) {
    startPlaybackFn = startPlayback;

    // Bind refresh button here or in script.js? Script.js usually handles UI binding.
    // But we can expose a refresh function.
    const refreshBtn = document.getElementById('discover-refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => refreshDiscover());
    }
}

// Fetchers for other APIs
async function fetchLastFMTracks() {
    try {
        const response = await fetch('/api/discover/lastfm');
        if (!response.ok) throw new Error('LastFM API Request failed');
        const data = await response.json();
        // Transform to our format
        // LastFM tracks don't have audio URLs usually, so we might need to search Jamendo for them?
        // Or just display them as "Top Tracks" (Non-playable or text only).
        // For a Music Player, user expects playback.
        // Strategy: We will render them, but maybe clicking them searches Jamendo?
        // Or simplified: Just show them.

        return data.map((t, idx) => ({
            id: `lastfm-${idx}`,
            title: t.name,
            artist: t.artist.name,
            album: 'LastFM Top Charts',
            duration: 0,
            coverURL: t.image?.[2]['#text'] || 'assets/logo-00.png',
            objectURL: null, // No audio
            isURL: true,
            isFromDiscover: true,
            source: 'lastfm'
        }));
    } catch (e) {
        console.error(e);
        return [];
    }
}

async function fetchAudioDBTrending() {
    try {
        const response = await fetch('/api/discover/theaudiodb');
        if (!response.ok) throw new Error('AudioDB API Request failed');
        const data = await response.json();
        return data.map(t => ({
            id: `adb-${t.idTrack}`,
            title: t.strTrack,
            artist: t.strArtist,
            album: t.strAlbum,
            duration: 0,
            coverURL: t.strTrackThumb || t.strAlbumThumb || 'assets/logo-00.png',
            objectURL: null, // No audio
            isURL: true,
            isFromDiscover: true,
            source: 'audiodb'
        }));
    } catch (e) {
        console.error(e);
        return [];
    }
}

// Sort orders for Jamendo to provide variety
const JAMENDO_ORDERS = ['popularity_week', 'popularity_month', 'buzzrate', 'downloads_week', 'downloads_month', 'releasedate'];

export async function fetchJamendoTracks(query = '') {
    // Call our own server's proxy endpoint
    // Add randomness for "Refresh" by picking a random sort order
    const order = JAMENDO_ORDERS[Math.floor(Math.random() * JAMENDO_ORDERS.length)];
    const url = query ? `/api/discover?search=${encodeURIComponent(query)}` : `/api/discover?order=${order}`;
    const discoverGrid = document.getElementById('discover-grid');

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Jamendo API request failed with status ${response.status}`);
        }
        const data = await response.json();

        // Map Jamendo track data to our application's track format and store it
        playerContext.discoverTracks = data.results.map(track => ({
            id: `jamendo-${track.id}`, // Unique ID for discover tracks
            title: track.name,
            artist: track.artist_name,
            album: track.album_name,
            duration: track.duration,
            coverURL: track.image.replace('width=200', 'width=400'), // Get a larger image
            objectURL: track.audio, // This is the streamable URL
            isURL: true,
            isFromDiscover: true, // Custom flag
            source: 'jamendo'
        }));

        return playerContext.discoverTracks;
    } catch (error) {
        console.error("Error fetching from discover endpoint:", error);
        if (discoverGrid) discoverGrid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">Could not load tracks from Jamendo. Please check your connection or API key.</div>`;
        return [];
    }
}

export function renderDiscoverCards(tracks) {
    const discoverGrid = document.getElementById('discover-grid');
    if (!discoverGrid) return;

    if (tracks.length === 0) {
        discoverGrid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">No tracks found.</div>`;
        return;
    }

    discoverGrid.innerHTML = tracks.map(track => `
        <div class="recent-media-card" data-track-id="${track.id}" tabindex="0">
            <div class="album-art">
                <img src="${track.coverURL}" alt="${track.title}" loading="lazy">
                ${track.objectURL ? '' : '<div class="source-badge" style="position:absolute;bottom:0;right:0;background:rgba(0,0,0,0.7);color:white;padding:2px 5px;font-size:10px;">MetaData Only</div>'}
            </div>
            <div class="card-footer">
                ${track.objectURL ? `<button class="control-btn small card-footer-play-btn" title="Play"><i class="fas fa-play"></i></button>` : `<button class="control-btn small card-search-btn" title="Search on Jamendo"><i class="fas fa-search"></i></button>`}
                <h5>${track.title}</h5>
            </div>
        </div>
    `).join('');

    // Play button logic
    discoverGrid.querySelectorAll('.card-footer-play-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent card click
            const trackId = e.currentTarget.closest('.recent-media-card').dataset.trackId;
            if (startPlaybackFn) startPlaybackFn([trackId]);
        });
    });

    // Search button (for non-playable tracks)
    discoverGrid.querySelectorAll('.card-search-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const trackTitle = e.currentTarget.closest('.recent-media-card').querySelector('h5').textContent;
            renderDiscoverGrid(trackTitle); // Reuse existing render which calls fetchJamendoTracks logic
        });
    });
}

async function fetchHearThisTracks() {
    try {
        // Fetch 50 to match other sources for good deduplication
        const response = await fetch('/api/discover/hearthis?count=50');
        if (!response.ok) throw new Error('HearThis API Request failed');
        const data = await response.json();

        return data.map(t => ({
            id: `ht-${t.id}`,
            title: t.title,
            artist: t.user.username,
            album: 'HearThis.at Upload',
            duration: t.duration,
            coverURL: t.thumb || t.artwork_url || 'assets/logo-00.png',
            objectURL: t.stream_url, // Playable!
            isURL: true,
            isFromDiscover: true,
            source: 'hearthis'
        }));
    } catch (e) {
        console.error(e);
        return [];
    }
}

async function fetchMusicBrainzTracks() {
    try {
        const response = await fetch('/api/discover/musicbrainz?limit=50');
        if (!response.ok) throw new Error('MusicBrainz API Request failed');
        const data = await response.json();

        return data.map(t => ({
            id: `mb-${t.id}`,
            title: t.title,
            artist: t.artist,
            album: t.album, // Release title
            duration: 0, // MusicBrainz doesn't provide duration easily in this view
            coverURL: t.coverURL || 'assets/logo-00.png',
            objectURL: null, // Not playable
            isURL: false,
            isFromDiscover: true,
            source: 'musicbrainz'
        }));
    } catch (e) {
        console.error(e);
        return [];
    }
}


// Helper to shuffle array (Fisher-Yates)
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Fetchers modified to accept limits if possible, or we slice results
// We'll trust the individual fetch functions or slice the results here.

async function refreshDiscover() {
    const discoverGrid = document.getElementById('discover-grid');
    if (discoverGrid) {
        discoverGrid.innerHTML = `<div class="loading-spinner" style="grid-column: 1 / -1; display:flex; justify-content:center; align-items: center; min-height: 200px; font-size: 1.2em; color: var(--text-color);"><i class="fas fa-spinner fa-spin" style="margin-right: 10px;"></i> Exploring the Musicverse...</div>`;
    }

    try {
        // Fetch from all sources in parallel
        // We limit to ~10-15 tracks per source to keep it snappy and not overwhelm the grid
        const promises = [
            fetchJamendoTracks().then(tracks => tracks.slice(0, 15)), // Fetch standard batch, take top 15
            fetchHearThisTracks().then(tracks => tracks.slice(0, 15)),
            fetchLastFMTracks().then(tracks => tracks.slice(0, 10)),
            fetchAudioDBTrending().then(tracks => tracks.slice(0, 10)),
            fetchMusicBrainzTracks().then(tracks => tracks.slice(0, 10))
        ];

        const results = await Promise.allSettled(promises);

        let allTracks = [];
        results.forEach(result => {
            if (result.status === 'fulfilled') {
                allTracks = allTracks.concat(result.value);
            }
        });

        // Deduplicate by title
        const seenTitles = new Set();
        const uniqueTracks = [];
        for (const track of allTracks) {
            const normalizedTitle = track.title.toLowerCase().trim();
            if (!seenTitles.has(normalizedTitle)) {
                seenTitles.add(normalizedTitle);
                uniqueTracks.push(track);
            }
        }

        // Shuffle the combined unique list
        const mixedTracks = shuffleArray(uniqueTracks);

        playerContext.discoverTracks = mixedTracks;
        renderDiscoverCards(mixedTracks);

    } catch (e) {
        console.error("Refresh Error:", e);
        if (discoverGrid) discoverGrid.innerHTML = `<div class="empty-state">Failed to load fresh tracks. Try again.</div>`;
    }
}

export async function renderDiscoverGrid(query = '') {
    const discoverGrid = document.getElementById('discover-grid');
    if (!discoverGrid) return;
    const loadingMessage = query ? `Searching for "${query}"...` : 'Loading popular tracks...';
    discoverGrid.innerHTML = `<div class="loading-spinner" style="grid-column: 1 / -1;">${loadingMessage}</div>`;

    // If query exists, always use Jamendo (as it is the search provider)
    let tracks = [];
    if (query) {
        tracks = await fetchJamendoTracks(query);
    } else {
        // Init load: default to Jamendo or Refresh Logic?
        // Default to Jamendo for audio immediate gratification
        tracks = await fetchJamendoTracks();
    }
    renderDiscoverCards(tracks);
}
