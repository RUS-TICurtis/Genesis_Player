const axios = require('axios');

async function fetchMusicBrainzTrending(limit = 20) {
  try {
    // MusicBrainz doesn't have a "trending" endpoint.
    // We'll search for official releases from the US, maybe offset by a random amount to get variety.
    const offset = Math.floor(Math.random() * 1000);
    const response = await axios.get('https://musicbrainz.org/ws/2/release', {
      params: {
        query: 'status:official AND country:US', // Broad search
        limit: limit,
        offset: offset,
        fmt: 'json'
      },
      headers: {
        'User-Agent': 'MusicDiscoveryApp/1.0.0 ( mymusicapp@localhost )' // Less likely to be blocked than example.com
      }
    });

    if (response.data && response.data.releases) {
      return response.data.releases.map(release => {
        // Construct cover art URL (Cover Art Archive)
        // http://coverartarchive.org/release/{release-id}/front
        const coverURL = `http://coverartarchive.org/release/${release.id}/front`;

        return {
          id: release.id,
          title: release.title,
          artist: release['artist-credit']?.[0]?.artist?.name || 'Unknown Artist',
          album: release.title, // It's a release, so title is album
          coverURL: coverURL,
          // MusicBrainz doesn't give audio streams.
          // We can't set objectURL.
          isURL: false,
          source: 'musicbrainz'
        };
      });
    }
    return [];

  } catch (error) {
    console.error('MusicBrainz fetch failed:', error.message);
    return [];
  }
}

module.exports = { fetchMusicBrainzTrending };