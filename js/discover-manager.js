import { playerContext } from './state.js';
import { truncate, getFallbackImage } from './utils.js';

let startPlaybackFn = null;
let currentSource = 'jamendo';
const DISCOVER_STORAGE_KEY = 'genesis_discover_tracks';

export function setDiscoverDependencies(startPlayback) {
    startPlaybackFn = startPlayback;

    // Bind refresh button here or in script.js? Script.js usually handles UI binding.
    // But we can expose a refresh function.
    const refreshBtn = document.getElementById('discover-refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => refreshDiscover());
    }
}

async function fetchSpotifyTrending() {
    try {
        const response = await fetch('/api/spotify/trending');
        if (!response.ok) throw new Error('Spotify API Request failed');
        const data = await response.json();
        return data;
    } catch (e) {
        console.error('Spotify fetch error:', e);
        return [];
    }
}

async function fetchSpotifyGenre(genre, limit = 5) {
    try {
        const response = await fetch(`/api/spotify/genre?genre=${encodeURIComponent(genre)}&limit=${limit}`);
        if (!response.ok) throw new Error('Spotify Genre API Request failed');
        const data = await response.json();
        return data;
    } catch (e) {
        console.error(`Spotify genre fetch error (${genre}):`, e);
        return [];
    }
}

async function checkSpotifyStatus() {
    try {
        const response = await fetch('/api/spotify/status');
        if (!response.ok) throw new Error('Spotify status API request failed');
        const data = await response.json();
        return data?.ok === true;
    } catch (e) {
        console.error('Spotify status check error:', e);
        return false;
    }
}

async function fetchDeezerTrending(limit = 20) {
    try {
        const response = await fetch(`/api/deezer/trending?limit=${limit}`);
        if (!response.ok) throw new Error('Deezer trending API request failed');
        const data = await response.json();
        return data;
    } catch (e) {
        console.error('Deezer trending fetch error:', e);
        return [];
    }
}

async function fetchDeezerGenre(genre, limit = 6) {
    try {
        const response = await fetch(`/api/deezer/genre?genre=${encodeURIComponent(genre)}&limit=${limit}`);
        if (!response.ok) throw new Error('Deezer genre API request failed');
        const data = await response.json();
        return data;
    } catch (e) {
        console.error(`Deezer genre fetch error (${genre}):`, e);
        return [];
    }
}

async function searchDeezer(query, limit = 20) {
    try {
        const response = await fetch(`/api/deezer/search?q=${encodeURIComponent(query)}&limit=${limit}`);
        if (!response.ok) throw new Error('Deezer search API request failed');
        const data = await response.json();
        return data;
    } catch (e) {
        console.error('Deezer search error:', e);
        return [];
    }
}

async function checkDeezerStatus() {
    try {
        const response = await fetch('/api/deezer/status');
        if (!response.ok) throw new Error('Deezer status API request failed');
        const data = await response.json();
        return data?.ok === true;
    } catch (e) {
        console.error('Deezer status check error:', e);
        return false;
    }
}

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
            coverURL: t.image?.[2]['#text'] || getFallbackImage(t.name, t.name),
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
            coverURL: t.strTrackThumb || t.strAlbumThumb || getFallbackImage(t.strTrack, t.strTrack),
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


async function searchSpotify(query) {
    try {
        const response = await fetch(`/api/spotify/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error('Spotify search failed');
        const data = await response.json();
        return data;
    } catch (e) {
        console.error('Spotify search error:', e);
        return [];
    }
}

// Sort orders for Jamendo to provide variety
const JAMENDO_ORDERS = ['popularity_week', 'popularity_month', 'buzzrate', 'downloads_week', 'downloads_month', 'releasedate'];

function hashString(value = '') {
    let hash = 0;
    const str = String(value);
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(36);
}

function sanitizeDiscoverTracks(tracks) {
    return (tracks || []).map((track, idx) => {
        if (!track || !track.title) return null;

        const source = track.source || 'discover';
        const rawId = track.id ? String(track.id) : '';
        const id = rawId && rawId !== 'undefined' && rawId !== 'null'
            ? rawId
            : `${source}-${hashString(`${track.title}|${track.artist || ''}|${track.album || ''}|${idx}`)}`;

        return {
            ...track,
            id,
            source,
            coverURL: track.coverURL || getFallbackImage(id, track.title),
            isFromDiscover: true
        };
    }).filter(Boolean);
}

export async function fetchJamendoTracks(query = '', shouldPersist = true, showErrorUI = true) {
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
        const tracks = sanitizeDiscoverTracks((data.results || []).map(track => ({
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
        })));

        if (shouldPersist) {
            playerContext.discoverTracks = tracks;
            saveDiscoverTracks(tracks);
        }
        return tracks;
    } catch (error) {
        console.error("Error fetching from discover endpoint:", error);
        if (showErrorUI && discoverGrid) {
            discoverGrid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">Could not load tracks from Jamendo. Please check your connection or API key.</div>`;
        }
        return [];
    }
}

function saveDiscoverTracks(tracks) {
    localStorage.setItem(DISCOVER_STORAGE_KEY, JSON.stringify(sanitizeDiscoverTracks(tracks)));
}

export function loadDiscoverFromStorage() {
    const stored = localStorage.getItem(DISCOVER_STORAGE_KEY);
    if (stored) {
        try {
            playerContext.discoverTracks = sanitizeDiscoverTracks(JSON.parse(stored));
            return true;
        } catch (e) {
            console.error("Error loading discover tracks from storage", e);
        }
    }
    return false;
}

export function renderDiscoverCards(tracks) {
    const discoverGrid = document.getElementById('discover-grid');
    if (!discoverGrid) return;

    const safeTracks = sanitizeDiscoverTracks(tracks);

    if (safeTracks.length === 0) {
        discoverGrid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">No tracks found.</div>`;
        return;
    }

    discoverGrid.innerHTML = safeTracks.map(track => {
        const isCurrentlyPlaying = playerContext.currentTrack?.id === track.id;
        const playingClass = isCurrentlyPlaying ? 'currently-playing' : '';
        return `
            <div class="recent-media-card ${playingClass}" data-track-id="${track.id}" tabindex="0">
                <div class="album-art">
                    <img src="${track.coverURL || getFallbackImage(track.id, track.title)}" alt="${track.title}" loading="lazy">
                    ${track.objectURL ? '' : '<div class="source-badge" style="position:absolute;bottom:0;right:0;background:rgba(0,0,0,0.7);color:white;padding:2px 5px;font-size:10px;">MetaData Only</div>'}
                </div>
                <div class="card-footer">
                    <button class="control-btn small card-footer-play-btn" title="Play"><i class="fas fa-play"></i></button>
                    <h5>${truncate(track.title, 40)}</h5>
                </div>
            </div>
        `;
    }).join('');

    discoverGrid.querySelectorAll('.album-art img').forEach((img) => {
        img.addEventListener('error', () => {
            if (img.dataset.fallbackApplied === '1') return;
            img.dataset.fallbackApplied = '1';
            const card = img.closest('.recent-media-card');
            img.src = getFallbackImage(card?.dataset.trackId || img.alt, img.alt);
        });
    });

    const discoverMap = new Map(safeTracks.map(t => [String(t.id), t]));

    // Play button logic
    discoverGrid.querySelectorAll('.card-footer-play-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent card click
            const trackId = String(e.currentTarget.closest('.recent-media-card').dataset.trackId || '');
            const selectedTrack = discoverMap.get(trackId);
            if (startPlaybackFn) startPlaybackFn([selectedTrack || trackId]);
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
            coverURL: t.thumb || t.artwork_url || getFallbackImage(t.title, t.title),
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
            id: t.id ? `mb-${t.id}` : null,
            title: t.title,
            artist: t.artist,
            album: t.album, // Release title
            duration: 0, // MusicBrainz doesn't provide duration easily in this view
            // Use local fallback art to avoid noisy CAA 404/500 errors in the browser console.
            coverURL: getFallbackImage(t.id || t.title, t.title),
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

function dedupeTracks(tracks) {
    const seen = new Set();
    const unique = [];

    for (const track of sanitizeDiscoverTracks(tracks)) {
        if (!track || !track.title) continue;

        const key = `${track.title.toLowerCase().trim()}::${(track.artist || '').toLowerCase().trim()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(track);
    }

    return unique;
}

function normalizeText(value = '') {
    return String(value).toLowerCase().trim();
}

function scoreTrackForQuery(track, normalizedQuery) {
    const title = normalizeText(track.title);
    const artist = normalizeText(track.artist);
    const album = normalizeText(track.album);
    let score = 0;

    if (title === normalizedQuery) score += 120;
    else if (title.startsWith(normalizedQuery)) score += 95;
    else if (title.includes(normalizedQuery)) score += 70;

    if (artist === normalizedQuery) score += 80;
    else if (artist.startsWith(normalizedQuery)) score += 55;
    else if (artist.includes(normalizedQuery)) score += 35;

    if (album.includes(normalizedQuery)) score += 12;
    if (track.objectURL) score += 6;

    if (track.source === 'deezer') score += 12;
    else if (track.source === 'spotify') score += 8;
    else if (track.source === 'jamendo') score += 4;

    return score;
}

function sortTracksForQuery(tracks, query) {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) return tracks;

    return [...tracks].sort((a, b) => scoreTrackForQuery(b, normalizedQuery) - scoreTrackForQuery(a, normalizedQuery));
}

// Fetchers modified to accept limits if possible, or we slice results
// We'll trust the individual fetch functions or slice the results here.

export async function refreshDiscover() {
    const discoverGrid = document.getElementById('discover-grid');
    if (discoverGrid) {
        discoverGrid.innerHTML = `<div class="loading-spinner" style="grid-column: 1 / -1; display:flex; justify-content:center; align-items: center; min-height: 200px; font-size: 1.2em; color: var(--text-color);"><i class="fas fa-spinner fa-spin" style="margin-right: 10px;"></i> Exploring the Musicverse...</div>`;
    }

    try {
        const [deezerHealthy, spotifyHealthy] = await Promise.all([
            checkDeezerStatus(),
            checkSpotifyStatus()
        ]);

        let deezerPriorityTracks = [];
        let spotifyPriorityTracks = [];

        // Deezer is the main Discover feed.
        if (deezerHealthy) {
            const deezerResults = await Promise.allSettled([
                fetchDeezerGenre('gospel', 6),
                fetchDeezerGenre('hip hop', 6),
                fetchDeezerTrending(12)
            ]);

            deezerResults.forEach(result => {
                if (result.status === 'fulfilled') {
                    deezerPriorityTracks = deezerPriorityTracks.concat(result.value);
                }
            });

            deezerPriorityTracks = dedupeTracks(deezerPriorityTracks).slice(0, 12);
            if (deezerPriorityTracks.length > 0) {
                playerContext.discoverTracks = deezerPriorityTracks;
                saveDiscoverTracks(deezerPriorityTracks);
                renderDiscoverCards(deezerPriorityTracks);
            }
        }

        // Spotify remains a secondary enrichment source.
        if (!deezerPriorityTracks.length && spotifyHealthy) {
            const spotifyResults = await Promise.allSettled([
                fetchSpotifyGenre('gospel', 5),
                fetchSpotifyGenre('hip-hop', 5),
                fetchSpotifyTrending()
            ]);

            spotifyResults.forEach(result => {
                if (result.status === 'fulfilled') {
                    spotifyPriorityTracks = spotifyPriorityTracks.concat(result.value);
                }
            });

            spotifyPriorityTracks = dedupeTracks(spotifyPriorityTracks).slice(0, 10);
            if (spotifyPriorityTracks.length > 0) {
                playerContext.discoverTracks = spotifyPriorityTracks;
                saveDiscoverTracks(spotifyPriorityTracks);
                renderDiscoverCards(spotifyPriorityTracks);
            }
        }

        const promises = [
            ...(deezerPriorityTracks.length ? [] : [
                fetchDeezerTrending(15)
            ]),
            ...(spotifyPriorityTracks.length ? [] : [
                fetchSpotifyGenre('gospel', 5),
                fetchSpotifyGenre('hip-hop', 5),
                fetchSpotifyTrending()
            ]),
            fetchJamendoTracks('', false, false).then(tracks => tracks.slice(0, 15)),
            fetchHearThisTracks().then(tracks => tracks.slice(0, 15)),
            fetchLastFMTracks().then(tracks => tracks.slice(0, 10)),
            fetchAudioDBTrending().then(tracks => tracks.slice(0, 10)),
            fetchMusicBrainzTracks().then(tracks => tracks.slice(0, 10))
        ];

        const results = await Promise.allSettled(promises);

        let allTracks = [...spotifyPriorityTracks, ...deezerPriorityTracks];
        results.forEach(result => {
            if (result.status === 'fulfilled') {
                allTracks = allTracks.concat(result.value);
            }
        });

        const uniqueTracks = dedupeTracks(allTracks);

        // Keep Deezer first, then Spotify, then shuffle the rest.
        const deezerFirst = uniqueTracks.filter(t => t.source === 'deezer');
        const spotifySecond = uniqueTracks.filter(t => t.source === 'spotify');
        const others = uniqueTracks.filter(t => t.source !== 'deezer' && t.source !== 'spotify');

        const priorityTracks = [...deezerFirst, ...spotifySecond];
        const otherTracks = shuffleArray(others);

        const finalTracks = sanitizeDiscoverTracks([...priorityTracks, ...otherTracks]);

        playerContext.discoverTracks = finalTracks;
        saveDiscoverTracks(finalTracks);
        renderDiscoverCards(finalTracks);

    } catch (e) {
        console.error("Refresh Error:", e);
        if (discoverGrid) discoverGrid.innerHTML = `<div class="empty-state">Failed to load fresh tracks. Try again.</div>`;
    }
}

export async function renderDiscoverGrid(query = '', forceRefresh = false) {
    const discoverGrid = document.getElementById('discover-grid');
    if (!discoverGrid) return;

    // Check storage first if no query and not forcing a refresh
    if (!query && !forceRefresh) {
        if (loadDiscoverFromStorage()) {
            renderDiscoverCards(playerContext.discoverTracks);
            return;
        }
    }

    const loadingMessage = query ? `Searching for "${query}"...` : 'Loading popular tracks...';
    discoverGrid.innerHTML = `<div class="loading-spinner" style="grid-column: 1 / -1;">${loadingMessage}</div>`;

    let tracks = [];
    if (query) {
        const [deezerResults, spotifyResults, jamendoResults] = await Promise.all([
            searchDeezer(query, 30),
            searchSpotify(query),
            fetchJamendoTracks(query, false, false)
        ]);

        // Deezer-first ranking with fuzzy relevance scoring.
        const combined = [...deezerResults, ...spotifyResults, ...jamendoResults];
        tracks = sanitizeDiscoverTracks(sortTracksForQuery(dedupeTracks(combined), query));
    } else {
        // Full Discover refresh handles source curation and fallback.
        await refreshDiscover();
        return;
    }
    renderDiscoverCards(tracks);
}
export async function fetchMix(type) {
    let url = '/api/discover';
    let mixName = 'Mix';

    switch (type) {
        case 'trending':
            url += '?order=popularity_week&limit=20';
            mixName = 'Trending Now';
            break;
        case 'new':
            url += '?order=releasedate&limit=20';
            mixName = 'New Arrivals';
            break;
        case 'pop':
            url += '?tags=pop&order=popularity_month&limit=20';
            mixName = 'Pop Hits';
            break;
        case 'rock':
            url += '?tags=rock&order=popularity_month&limit=20';
            mixName = 'Rock Classics';
            break;
        case 'electronic':
            url += '?tags=electronic&order=popularity_month&limit=20';
            mixName = 'Electronic Vibes';
            break;
        case 'lofi': // Fallback to search if tags not supported purely or just use tags
            url += '?tags=lofi&order=buzzerate&limit=20';
            mixName = 'Lo-Fi Chill';
            break;
        default:
            url += '?order=popularity_week&limit=20';
            mixName = 'Discover Mix';
    }

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Mix fetch failed');
        const data = await response.json();
        const tracks = data.results.map(track => ({
            id: `jamendo-${track.id}`,
            title: track.name,
            artist: track.artist_name,
            album: track.album_name,
            duration: track.duration,
            coverURL: track.image.replace('width=200', 'width=400'),
            objectURL: track.audio,
            isURL: true,
            isFromDiscover: true,
            source: 'jamendo'
        }));
        return { name: mixName, tracks };
    } catch (e) {
        console.error("Error fetching mix:", e);
        return { name: mixName, tracks: [] };
    }
}
