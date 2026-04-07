import axios from 'axios';

const DEEZER_BASE_URL = 'https://api.deezer.com';
const DEEZER_REQUEST_LIMIT = 50;
const DEEZER_WINDOW_MS = 5000;
const recentRequestTimestamps = [];

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function enforceDeezerRateLimit() {
    const now = Date.now();
    while (recentRequestTimestamps.length > 0 && (now - recentRequestTimestamps[0]) >= DEEZER_WINDOW_MS) {
        recentRequestTimestamps.shift();
    }

    if (recentRequestTimestamps.length >= DEEZER_REQUEST_LIMIT) {
        const waitMs = DEEZER_WINDOW_MS - (now - recentRequestTimestamps[0]) + 20;
        await sleep(Math.max(waitMs, 0));
    }

    recentRequestTimestamps.push(Date.now());
}

async function deezerGet(pathname, params = {}) {
    await enforceDeezerRateLimit();

    const response = await axios.get(`${DEEZER_BASE_URL}${pathname}`, {
        params,
        proxy: false,
        timeout: 15000,
        headers: {
            'Accept': 'application/json; charset=utf-8'
        }
    });

    return response.data;
}

function mapDeezerTrack(track) {
    if (!track || !track.id) return null;

    return {
        id: `deezer-${track.id}`,
        title: track.title || 'Unknown Title',
        artist: track.artist?.name || 'Unknown Artist',
        album: track.album?.title || 'Deezer',
        duration: track.duration || 0,
        coverURL: track.album?.cover_xl || track.album?.cover_big || track.album?.cover_medium || track.artist?.picture_medium || '',
        objectURL: null,
        previewURL: track.preview || null,
        requiresResolve: true,
        source: 'deezer',
        isURL: true,
        isFromDiscover: true
    };
}

function mapDeezerArtist(artist) {
    if (!artist || !artist.id) return null;

    return {
        id: String(artist.id),
        name: artist.name || 'Unknown Artist',
        picture: artist.picture_xl || artist.picture_big || artist.picture_medium || artist.picture || '',
        tracklist: artist.tracklist || '',
        source: 'deezer'
    };
}

export async function checkDeezerIntegration() {
    try {
        const data = await deezerGet('/chart/0/tracks', { limit: 1 });
        const ok = Array.isArray(data?.data);
        return { ok };
    } catch (error) {
        console.error('Deezer integration check failed:', error.response?.status, error.response?.data || error.message);
        return { ok: false };
    }
}

export async function fetchDeezerTrending(limit = 25) {
    try {
        const data = await deezerGet('/chart/0/tracks', { limit });
        return (data?.data || []).map(mapDeezerTrack).filter(Boolean);
    } catch (error) {
        console.error('Error fetching Deezer trending:', error.response?.status, error.response?.data || error.message);
        return [];
    }
}

export async function searchDeezer(query, limit = 20, index = 0) {
    try {
        const data = await deezerGet('/search', {
            q: query,
            index,
            limit
        });
        return (data?.data || []).map(mapDeezerTrack).filter(Boolean);
    } catch (error) {
        console.error('Error searching Deezer:', error.response?.status, error.response?.data || error.message);
        return [];
    }
}

export async function fetchDeezerGenre(genre, limit = 10, index = 0) {
    try {
        const genreQuery = `genre:"${genre}"`;
        let tracks = await searchDeezer(genreQuery, limit, index);

        if (!tracks.length) {
            tracks = await searchDeezer(genre, limit, index);
        }

        return tracks;
    } catch (error) {
        console.error(`Error fetching Deezer genre ${genre}:`, error.response?.status, error.response?.data || error.message);
        return [];
    }
}

export async function searchDeezerArtists(query, limit = 12) {
    try {
        const data = await deezerGet('/search/artist', {
            q: query,
            limit
        });

        return (data?.data || []).map(mapDeezerArtist).filter(Boolean);
    } catch (error) {
        console.error('Error searching Deezer artists:', error.response?.status, error.response?.data || error.message);
        return [];
    }
}

export async function fetchRelatedDeezerArtists(artistId, limit = 12) {
    try {
        const data = await deezerGet(`/artist/${artistId}/related`);
        return (data?.data || []).slice(0, limit).map(mapDeezerArtist).filter(Boolean);
    } catch (error) {
        console.error('Error fetching related Deezer artists:', error.response?.status, error.response?.data || error.message);
        return [];
    }
}
