import axios from 'axios';

async function fetchAudioDB(artist) {
  const res = await axios.get('https://theaudiodb.com/api/v1/json/2/search.php', {
    params: { s: artist }
  });
  return res.data.artists ? res.data.artists[0] : null;
}

async function fetchTrending() {
  try {
    const res = await axios.get('https://theaudiodb.com/api/v1/json/2/trending.php?country=us&type=itunes&format=singles');
    return res.data.trending || [];
  } catch (error) {
    console.warn('TheAudioDB fetchTrending failed:', error.message);
    return [];
  }
}

export { fetchAudioDB, fetchTrending };