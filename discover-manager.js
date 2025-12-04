let config = {
    discoverContent: null,
    showMessage: () => {},
    startPlayback: () => {},
};

/**
 * Initializes the discover manager.
 * @param {object} dependencies - The dependencies from the main script.
 */
export async function init(dependencies) {
    config = { ...config, ...dependencies };
    if (config.discoverContent) {
        await renderDiscoverGrid();
    }
}

async function fetchDiscoverTracks(query = 'popular') {
    try {
        const response = await fetch(`http://localhost:3000/discover?q=${encodeURIComponent(query)}`);
        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Failed to fetch discover tracks:', error);
        config.showMessage('Could not connect to the discovery service. Make sure the server is running.');
        return [];
    }
}

async function renderDiscoverGrid() {
    config.discoverContent.innerHTML = `<div class="empty-state">Loading new music...</div>`;
    const tracks = await fetchDiscoverTracks();

    if (!tracks || tracks.length === 0) {
        config.discoverContent.innerHTML = `<div class="empty-state">Could not load any tracks.</div>`;
        return;
    }

    config.discoverContent.innerHTML = tracks.map(track => {
        // Jamendo API provides different image sizes, let's pick a medium one
        const coverURL = track.image.replace('1.200x1200', '1.300x300');
        return `
            <div class="recent-media-card" data-track-id="${track.id}">
                <div class="album-art">
                    <img src="${coverURL}" alt="${track.name}">
                </div>
                <div class="card-footer">
                    <h5>${track.name}</h5>
                </div>
            </div>
        `;
    }).join('');

    config.discoverContent.querySelectorAll('.recent-media-card').forEach(card => {
        card.addEventListener('click', () => {
            const trackId = card.dataset.trackId;
            const trackData = tracks.find(t => t.id === trackId);
            if (trackData) {
                // Create a track object compatible with our player
                const playerTrack = {
                    id: trackData.id,
                    name: trackData.name,
                    artist: trackData.artist_name,
                    album: trackData.album_name,
                    duration: trackData.duration,
                    coverURL: trackData.image,
                    objectURL: trackData.audio, // Direct audio URL
                    isURL: true, // Mark as a stream
                };
                config.startPlayback([playerTrack], 0);
            }
        });
    });
}