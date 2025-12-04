import { db } from './db.js';

let config = {
    discoverContent: null,
    showMessage: () => {},
    startPlayback: () => {},
    downloadAndCacheTrack: () => {},
};

/**
 * Initializes the discover manager.
 * @param {object} dependencies - The dependencies from the main script.
 */
export async function init(dependencies) {
    config = { ...config, ...dependencies };
    if (config.discoverContent) {
        const searchInput = document.getElementById('discover-search-input');
        const searchBtn = document.getElementById('discover-search-btn');

        // Handle online/offline state changes
        const updateOnlineStatus = () => {
            const isOffline = !navigator.onLine;
            searchInput.disabled = isOffline;
            searchBtn.disabled = isOffline;
            if (isOffline) {
                searchInput.placeholder = "Search is disabled offline";
            } else {
                searchInput.placeholder = "Search artists, albums, tracks...";
            }
        };

        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);
        updateOnlineStatus(); // Set initial state

        // Load popular tracks on initial view
        await renderDiscoverGrid('popular');

        searchBtn.addEventListener('click', () => renderDiscoverGrid(searchInput.value));
        searchInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') renderDiscoverGrid(searchInput.value);
        });
    }
}

async function cacheEnrichedData(track) {
  // Fetch album art and convert to a blob for offline storage
  let albumArtBlob = null;
  if (track.albumArt) {
    try {
      const response = await fetch(track.albumArt);
      if (response.ok) {
        albumArtBlob = await response.blob();
      }
    } catch (error) {
      console.warn(`Failed to fetch and cache album art for ${track.title}`, error);
    }
  }

  // Cache the track object
  await db.tracks.put({
    id: track.id.toString(),
    title: track.title,
    artist: track.artist,
    album: track.album,
    albumArtBlob: albumArtBlob, // Store the blob
    audioUrl: track.audioUrl,
    albumArt: track.albumArt,
    bio: track.bio,
    tags: track.tags,
    lyricsUrl: track.lyricsUrl,
    mbid: track.mbid,
    downloaded: false // Initially, only metadata is cached, not the audio file
  });

  // Cache the artist object separately for the 'Artists' view
  // Use 'put' to add or update the artist info
  if (track.artist) {
    await db.artists.put({
      name: track.artist,
      genre: track.tags?.[0] || '',
      bio: track.bio,
      imageUrl: track.albumArt, // Use track album art as a proxy for artist image
      similarArtists: track.similarArtists
    });
  }
}

async function fetchDiscoverTracks(query = 'popular') {
    // Offline-first strategy
    try {
        if (!navigator.onLine) {
            throw new Error("Offline mode detected. Searching cache.");
        }
        const response = await fetch(`/discover?q=${encodeURIComponent(query)}`);
        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}`);
        }
        const enrichedTracks = await response.json();

        // Asynchronously cache each enriched track for future offline use
        enrichedTracks.forEach(track => cacheEnrichedData(track));

        return enrichedTracks;
    } catch (error) {
        console.warn('Network fetch failed:', error.message);
        config.showMessage('Offline. Searching your local cache...');

        // Fallback: If offline or server fails, search the local cache
        const qLower = query.toLowerCase();
        const cached = await db.tracks.filter(track => 
            track.title.toLowerCase().includes(qLower) || 
            track.artist.toLowerCase().includes(qLower)
        ).toArray();
        return cached;
    }
}

async function renderDiscoverGrid(query) {
    const searchQuery = query.trim();
    if (!searchQuery) {
        config.showMessage("Please enter a search term.");
        return;
    }
    config.discoverContent.innerHTML = `<div class="empty-state">Searching for "${searchQuery}"...</div>`;
    const tracks = await fetchDiscoverTracks(searchQuery);

    if (!tracks || tracks.length === 0) {
        config.discoverContent.innerHTML = `<div class="empty-state">Could not load any tracks.</div>`;
        return;
    }

    config.discoverContent.innerHTML = tracks.map(track => {
        // Jamendo API provides different image sizes, let's pick a medium one
        const coverURL = track.albumArtBlob
            ? URL.createObjectURL(track.albumArtBlob)
            : (track.albumArt ? track.albumArt.replace('1.200x1200', '1.300x300') : './assets/default-art.png');
        const tagsHTML = track.tags && track.tags.length > 0
            ? `<div class="card-tags">${track.tags.slice(0, 2).map(tag => `<span>${tag}</span>`).join('')}</div>`
            : '';

        return `
            <div class="recent-media-card" data-track-id="${track.id}">
                <div class="album-art" data-action="play">
                    <img src="${coverURL}" alt="${track.title}">
                </div>
                <div class="card-body">
                    ${tagsHTML}
                </div>
                <div class="card-footer">
                    <h5>${track.title}</h5>
                    <button class="control-btn small track-action-btn" title="Download" data-action="download"><i class="fas fa-download"></i></button>
                </div>
            </div>
        `;
    }).join('');

    config.discoverContent.querySelectorAll('.recent-media-card').forEach(card => {
        card.addEventListener('click', (e) => {
            const action = e.target.closest('[data-action]')?.dataset.action;
            if (!action) return;

            const trackId = card.dataset.trackId;
            const trackData = tracks.find(t => t.id.toString() === trackId);

            if (action === 'play' && trackData) {
                // Create a track object compatible with our player
                const playerTrack = {
                    id: trackData.id,
                    name: trackData.title,
                    artist: trackData.artist,
                    album: track.album,
                    duration: trackData.duration,
                    coverURL: trackData.albumArt,
                    objectURL: trackData.audioUrl, // Direct audio URL for streaming
                    isURL: true, // Mark as a stream
                };
                config.startPlayback([playerTrack], 0);
            } else if (action === 'download' && trackData) {
                config.downloadAndCacheTrack(trackData);
            }
        });
    });
}