import axios from 'axios';

let accessToken = '';
let tokenExpires = 0;

async function getAccessToken() {
    const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
    const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

    if (accessToken && Date.now() < tokenExpires) {
        return accessToken;
    }

    if (!CLIENT_ID || !CLIENT_SECRET || CLIENT_SECRET === 'PASTE_YOUR_SECRET_HERE') {
        throw new Error('Spotify credentials missing in .env');
    }

    const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    try {
        const response = await axios.post('https://accounts.spotify.com/api/token', 'grant_type=client_credentials', {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        accessToken = response.data.access_token;
        tokenExpires = Date.now() + (response.data.expires_in * 1000) - 60000; // 1 min buffer
        return accessToken;
    } catch (error) {
        console.error('Error fetching Spotify access token:', error.response?.data || error.message);
        throw error;
    }
}

export async function fetchSpotifyTrending() {
    try {
        const token = await getAccessToken();

        // Strategy: Search for "Global Top 50" playlist to get trending tracks
        const searchUrl = 'https://api.spotify.com/v1/search?q=Global%20Top%2050&type=playlist&limit=1';
        console.log(`Searching for trending playlists at: ${searchUrl}`);
        const searchRes = await axios.get(searchUrl, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const playlist = searchRes.data.playlists?.items?.[0];
        if (!playlist) {
            console.warn('No trending playlist found, falling back to track search.');
            const fallbackRes = await axios.get('https://api.spotify.com/v1/search?q=year:2024-2025&type=track&limit=25', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            return (fallbackRes.data.tracks?.items || []).map(track => mapSpotifyTrack(track)).filter(t => t !== null);
        }

        const playlistTracksUrl = `https://api.spotify.com/v1/playlists/${playlist.id}/tracks?limit=25`;
        console.log(`Fetching tracks from playlist: ${playlist.name} (${playlist.id})`);
        const tracksResponse = await axios.get(playlistTracksUrl, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        return (tracksResponse.data.items || []).map(item => mapSpotifyTrack(item.track)).filter(t => t !== null);

    } catch (error) {
        console.error('Error fetching Spotify trending:', error.response?.status, error.response?.data || error.message);
        return [];
    }
}

// Helper to map Spotify track to internal format
function mapSpotifyTrack(track) {
    if (!track) return null;
    return {
        id: `spotify-${track.id}`,
        title: track.name,
        artist: track.artists.map(a => a.name).join(', '),
        album: track.album.name,
        duration: Math.floor(track.duration_ms / 1000),
        coverURL: track.album.images[0]?.url,
        source: 'spotify',
        isURL: true,
        isFromDiscover: true
    };
}

export async function searchSpotify(query) {
    try {
        const token = await getAccessToken();
        const response = await axios.get(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=20`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        return response.data.tracks.items.map(track => mapSpotifyTrack(track));
    } catch (error) {
        console.error('Error searching Spotify:', error.message);
        return [];
    }
}

export async function fetchSpotifyGenre(genre, limit = 5) {
    try {
        const token = await getAccessToken();
        const response = await axios.get(`https://api.spotify.com/v1/search?q=genre:${encodeURIComponent(genre)}&type=track&limit=${limit}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        return response.data.tracks.items.map(track => mapSpotifyTrack(track));
    } catch (error) {
        console.error(`Error fetching Spotify genre ${genre}:`, error.message);
        return [];
    }
}
