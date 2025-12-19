const axios = require('axios');

async function fetchLastFM(artist) {
  const res = await axios.get('http://ws.audioscrobbler.com/2.0/', {
    params: {
      method: 'artist.getinfo',
      artist,
      api_key: process.env.LASTFM_API_KEY,
      format: 'json'
    }
  });
  return res.data.artist || null;
}

async function fetchTopTracks(limit = 50) {
  try {
    const res = await axios.get('http://ws.audioscrobbler.com/2.0/', {
      params: {
        method: 'chart.gettoptracks',
        api_key: process.env.LASTFM_API_KEY,
        format: 'json',
        limit
      }
    });
    return res.data.tracks?.track || [];
  } catch (error) {
    console.warn('LastFM fetchTopTracks failed:', error.message);
    return [];
  }
}

async function fetchTrackInfo(artist, track) {
  try {
    const res = await axios.get('http://ws.audioscrobbler.com/2.0/', {
      params: {
        method: 'track.getInfo',
        api_key: process.env.LASTFM_API_KEY,
        artist,
        track,
        format: 'json'
      }
    });
    return res.data.track || null;
  } catch (error) {
    console.warn('LastFM fetchTrackInfo failed:', error.message);
    return null;
  }
}

module.exports = { fetchLastFM, fetchTopTracks, fetchTrackInfo };