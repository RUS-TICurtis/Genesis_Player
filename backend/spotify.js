import axios from 'axios';

/**
 * Spotify Discovery Service (Mocked/Fallback version)
 * In a real-world scenario, this would use the Spotify Web API with Client Credentials.
 * Since we don't have active keys, we provide a curated "Trending" list
 * that mimics Spotify's current top hits to ensure a high-quality "First Load" experience.
 */

async function fetchSpotifyTrending() {
  try {
    // We provide a high-quality curated list as a fallback to ensure the "Spotify First" requirement
    // feels premium even without an active API key in the environment.
    const trendingTracks = [
      {
        id: 'spot-1',
        title: 'Cruel Summer',
        artist: 'Taylor Swift',
        album: 'Lover',
        coverURL: 'https://i.scdn.co/image/ab67616d0000b273e787cffec20aa2a0a65f3a6a',
        source: 'spotify',
        isURL: true,
        objectURL: null // Metadata only for now
      },
      {
        id: 'spot-2',
        title: 'Flowers',
        artist: 'Miley Cyrus',
        album: 'Endless Summer Vacation',
        coverURL: 'https://i.scdn.co/image/ab67616d0000b273f4293e62057d3839293a985d',
        source: 'spotify',
        isURL: true,
        objectURL: null
      },
      {
        id: 'spot-3',
        title: 'Starboy',
        artist: 'The Weeknd',
        album: 'Starboy',
        coverURL: 'https://i.scdn.co/image/ab67616d0000b2734718e5b03ef76550787e915d',
        source: 'spotify',
        isURL: true,
        objectURL: null
      },
      {
        id: 'spot-4',
        title: 'As It Was',
        artist: 'Harry Styles',
        album: "Harry's House",
        coverURL: 'https://i.scdn.co/image/ab67616d0000b273b46f74097655d7f353caab14',
        source: 'spotify',
        isURL: true,
        objectURL: null
      },
      {
        id: 'spot-5',
        title: 'Kill Bill',
        artist: 'SZA',
        album: 'SOS',
        coverURL: 'https://i.scdn.co/image/ab67616d0000b27370dbc9f47669d120ad874ec1',
        source: 'spotify',
        isURL: true,
        objectURL: null
      },
      {
        id: 'spot-6',
        title: 'Blinding Lights',
        artist: 'The Weeknd',
        album: 'After Hours',
        coverURL: 'https://i.scdn.co/image/ab67616d0000b2738863bc1230e704e6c3848b59',
        source: 'spotify',
        isURL: true,
        objectURL: null
      }
    ];

    // Attempt to enrich with real search results from Jamendo for playability if possible?
    // For now, return the curated metadata as "Spotify Trending".
    return trendingTracks;
  } catch (error) {
    console.error('Spotify Discovery Error:', error.message);
    return [];
  }
}

export { fetchSpotifyTrending };
