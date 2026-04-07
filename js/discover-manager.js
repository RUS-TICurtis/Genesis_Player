import { playerContext } from './state.js';
import { getTasteProfile, getTasteProfileSeeds } from './onboarding-manager.js';
import { createApiUrl } from './api-config.js';
import { truncate, getFallbackImage } from './utils.js';

let startPlaybackFn = null;
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

async function fetchDeezerTrending(limit = 20) {
    try {
        const response = await fetch(createApiUrl(`/api/deezer/trending?limit=${limit}`));
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
        const response = await fetch(createApiUrl(`/api/deezer/genre?genre=${encodeURIComponent(genre)}&limit=${limit}`));
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
        const response = await fetch(createApiUrl(`/api/deezer/search?q=${encodeURIComponent(query)}&limit=${limit}`));
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
        const response = await fetch(createApiUrl('/api/deezer/status'));
        if (!response.ok) throw new Error('Deezer status API request failed');
        const data = await response.json();
        return data?.ok === true;
    } catch (e) {
        console.error('Deezer status check error:', e);
        return false;
    }
}

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
        if (source !== 'deezer') return null;
        const rawId = track.id ? String(track.id) : '';
        const id = rawId && rawId !== 'undefined' && rawId !== 'null'
            ? rawId
            : `${source}-${hashString(`${track.title}|${track.artist || ''}|${track.album || ''}|${idx}`)}`;

        const normalizedTrack = {
            ...track,
            id,
            source,
            coverURL: track.coverURL || getFallbackImage(id, track.title),
            isFromDiscover: true
        };

        if (source === 'deezer' && normalizedTrack.objectURL && !normalizedTrack.streamMode) {
            normalizedTrack.previewURL = normalizedTrack.previewURL || normalizedTrack.objectURL;
            normalizedTrack.objectURL = null;
            normalizedTrack.requiresResolve = true;
        }

        return normalizedTrack;
    }).filter(Boolean);
}

function canResolveForPlayback(track) {
    return Boolean(track?.objectURL || track?.previewURL || track?.source === 'deezer');
}

function hasFullPlayback(track) {
    return Boolean(track?.objectURL && track?.streamMode !== 'preview');
}

function sortTracksForPlaybackPriority(tracks) {
    return [...tracks].sort((a, b) => {
        const aFull = hasFullPlayback(a) ? 1 : 0;
        const bFull = hasFullPlayback(b) ? 1 : 0;
        if (aFull !== bFull) return bFull - aFull;

        const aResolvable = canResolveForPlayback(a) ? 1 : 0;
        const bResolvable = canResolveForPlayback(b) ? 1 : 0;
        if (aResolvable !== bResolvable) return bResolvable - aResolvable;

        return 0;
    });
}

function saveDiscoverTracks(tracks) {
    localStorage.setItem(DISCOVER_STORAGE_KEY, JSON.stringify(sanitizeDiscoverTracks(tracks)));
}

export function loadDiscoverFromStorage() {
    const stored = localStorage.getItem(DISCOVER_STORAGE_KEY);
    if (stored) {
        try {
            const deezerOnlyTracks = sanitizeDiscoverTracks(JSON.parse(stored));
            if (!deezerOnlyTracks.length) {
                localStorage.removeItem(DISCOVER_STORAGE_KEY);
                return false;
            }
            playerContext.discoverTracks = deezerOnlyTracks;
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
        const playbackBadge = track.streamMode === 'preview'
            ? '<div class="source-badge" style="position:absolute;bottom:0;right:0;background:rgba(0,0,0,0.78);color:white;padding:2px 6px;font-size:10px;">30s Preview</div>'
            : (!canResolveForPlayback(track)
                ? '<div class="source-badge" style="position:absolute;bottom:0;right:0;background:rgba(0,0,0,0.7);color:white;padding:2px 5px;font-size:10px;">MetaData Only</div>'
                : '');
        return `
            <div class="recent-media-card ${playingClass}" data-track-id="${track.id}" tabindex="0">
                <div class="album-art">
                    <img src="${track.coverURL || getFallbackImage(track.id, track.title)}" alt="${track.title}" loading="lazy">
                    ${playbackBadge}
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
            renderDiscoverGrid(trackTitle); // Re-run Deezer search for a tighter match
        });
    });
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

function getDiscoverSeedPreferences() {
    const profile = getTasteProfile();

    return {
        genres: profile?.selectedGenres?.length ? profile.selectedGenres.slice(0, 3) : ['gospel', 'hip hop'],
        artists: getTasteProfileSeeds(4)
    };
}

async function fetchDeezerArtistTracks(artistName, limit = 6) {
    const preciseResults = await searchDeezer(`artist:"${artistName}"`, limit);
    if (preciseResults.length > 0) return preciseResults;
    return searchDeezer(artistName, limit);
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
    const { genres: seedGenres, artists: seedArtists } = getDiscoverSeedPreferences();
    if (discoverGrid) {
        const loadingLabel = seedArtists.length
            ? 'Dialing into your taste...'
            : 'Exploring the Musicverse...';
        discoverGrid.innerHTML = `<div class="loading-spinner" style="grid-column: 1 / -1; display:flex; justify-content:center; align-items: center; min-height: 200px; font-size: 1.2em; color: var(--text-color);"><i class="fas fa-spinner fa-spin" style="margin-right: 10px;"></i> ${loadingLabel}</div>`;
    }

    try {
        const deezerHealthy = await checkDeezerStatus();

        if (!deezerHealthy) {
            if (discoverGrid) {
                discoverGrid.innerHTML = `<div class="empty-state">Deezer is unavailable right now. Try again.</div>`;
            }
            playerContext.discoverTracks = [];
            localStorage.removeItem(DISCOVER_STORAGE_KEY);
            return;
        }

        let deezerTracks = [];
        const promises = [
            ...seedGenres.map((genre) => fetchDeezerGenre(genre, 8)),
            ...seedArtists.map((artistName) => fetchDeezerArtistTracks(artistName, 6)),
            fetchDeezerTrending(20)
        ];

        const results = await Promise.allSettled(promises);
        results.forEach(result => {
            if (result.status === 'fulfilled') {
                deezerTracks = deezerTracks.concat(result.value);
            }
        });

        const uniqueTracks = dedupeTracks(deezerTracks);
        const playableFirstTracks = sortTracksForPlaybackPriority(uniqueTracks);
        const finalTracks = sanitizeDiscoverTracks(playableFirstTracks);

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
        const deezerResults = await searchDeezer(query, 30);
        tracks = sanitizeDiscoverTracks(sortTracksForPlaybackPriority(sortTracksForQuery(dedupeTracks(deezerResults), query)));
    } else {
        // Full Discover refresh handles source curation and fallback.
        await refreshDiscover();
        return;
    }
    renderDiscoverCards(tracks);
}
export async function fetchMix(type) {
    let mixName = 'Mix';

    if (type?.startsWith('artist:')) {
        const artistName = type.slice('artist:'.length);
        const deezerTracks = await fetchDeezerArtistTracks(artistName, 18);

        return {
            name: `${artistName} Mix`,
            tracks: dedupeTracks(deezerTracks).slice(0, 24)
        };
    }

    if (type?.startsWith('genre:')) {
        const genre = type.slice('genre:'.length);
        const deezerTracks = await fetchDeezerGenre(genre, 18);

        return {
            name: `${genre} Picks`,
            tracks: dedupeTracks(deezerTracks).slice(0, 24)
        };
    }

    try {
        let tracks = [];

        switch (type) {
            case 'new':
            case 'trending':
                mixName = type === 'new' ? 'New Arrivals' : 'Trending Now';
                tracks = await fetchDeezerTrending(20);
                break;
            case 'pop':
                mixName = 'Pop Hits';
                tracks = await fetchDeezerGenre('pop', 20);
                break;
            case 'rock':
                mixName = 'Rock Classics';
                tracks = await fetchDeezerGenre('rock', 20);
                break;
            case 'electronic':
            case 'lofi':
                mixName = type === 'lofi' ? 'Lo-Fi Chill' : 'Electronic Vibes';
                tracks = await fetchDeezerGenre('electronic', 20);
                break;
            default:
                mixName = 'Discover Mix';
                tracks = await fetchDeezerTrending(20);
        }

        return { name: mixName, tracks: dedupeTracks(tracks).slice(0, 24) };
    } catch (e) {
        console.error("Error fetching mix:", e);
        return { name: mixName, tracks: [] };
    }
}
