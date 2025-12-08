import { playerContext } from './state.js';

let startPlaybackFn = null;

export function setDiscoverDependencies(startPlayback) {
    startPlaybackFn = startPlayback;
}

export async function fetchJamendoTracks(query = '') {
    // Call our own server's proxy endpoint
    const url = query ? `/api/discover?search=${encodeURIComponent(query)}` : '/api/discover';
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
            isFromDiscover: true // Custom flag
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
                <img src="${track.coverURL}" alt="${track.title}">
            </div>
            <div class="card-footer">
                <button class="control-btn small card-footer-play-btn" title="Play"><i class="fas fa-play"></i></button>
                <h5>${track.title}</h5>
            </div>
        </div>
    `).join('');

    discoverGrid.querySelectorAll('.card-footer-play-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const trackId = e.currentTarget.closest('.recent-media-card').dataset.trackId;
            if (startPlaybackFn) startPlaybackFn([trackId]);
        });
    });
}

export async function renderDiscoverGrid(query = '') {
    const discoverGrid = document.getElementById('discover-grid');
    if (!discoverGrid) return;
    const loadingMessage = query ? `Searching for "${query}"...` : 'Loading popular tracks...';
    discoverGrid.innerHTML = `<div class="loading-spinner" style="grid-column: 1 / -1;">${loadingMessage}</div>`;
    const tracks = await fetchJamendoTracks(query);
    renderDiscoverCards(tracks);
}
